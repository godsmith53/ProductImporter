# app/tasks.py
from celery import Celery
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import SessionLocal, engine  # must export engine
from app.models import Product, ImportJob, ImportStatus
from app.webhook_service import trigger_webhook
from app.preprocesscsv import preprocess_dedupe_csv
import csv
import os
import logging
from datetime import datetime
import asyncio
import tempfile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Celery configuration
celery_app = Celery(
    "product_importer",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# ---- Configuration for COPY-based loader ----
STAGING_TABLE = "products_staging"
MAIN_TABLE = Product.__table__.name  # usually 'products'
COLUMNS = ["sku", "name", "description", "price", "is_active"]


def ensure_staging_table_exists():
    """
    (Re)create an UNLOGGED staging table with only the columns we COPY.
    We drop+create to avoid stale schemas with PKs / NOT NULLs.
    """
    recreate_sql = f"""
    DROP TABLE IF EXISTS {STAGING_TABLE};
    CREATE UNLOGGED TABLE {STAGING_TABLE} (
      sku varchar(255),
      name varchar(255),
      description text,
      price numeric(10,2),
      is_active boolean DEFAULT true
    );
    """
    with engine.begin() as conn:
        conn.execute(text(recreate_sql))
    logger.info(f"Recreated staging table '{STAGING_TABLE}' (UNLOGGED).")


def truncate_staging_table():
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {STAGING_TABLE};"))
    logger.info(f"Truncated staging table '{STAGING_TABLE}'.")


def copy_csv_file_to_staging(csv_path: str):
    """
    Use psycopg2 raw connection to use COPY for best performance.
    """
    conn = engine.raw_connection()
    try:
        cur = conn.cursor()
        with open(csv_path, "r", encoding="utf-8") as f:
            sql = f"COPY {STAGING_TABLE} ({', '.join(COLUMNS)}) FROM STDIN WITH CSV HEADER"
            cur.copy_expert(sql, f)
        conn.commit()
        cur.close()
    finally:
        try:
            conn.close()
        except Exception:
            pass


def merge_staging_to_main():
    """
    Merge data from staging into main table using a single statement.
    This assumes the products table provides DB defaults for id (e.g. gen_random_uuid()).
    Since duplicates are removed by preprocess, we don't dedupe again here.
    """
    update_cols = ", ".join([f"{col} = EXCLUDED.{col}" for col in COLUMNS if col != "sku"])
    merge_sql = f"""
    INSERT INTO {MAIN_TABLE} ({', '.join(COLUMNS)})
    SELECT {', '.join(COLUMNS)} FROM {STAGING_TABLE}
    ON CONFLICT (sku)
    DO UPDATE SET
      {update_cols};
    """
    with engine.begin() as conn:
        conn.execute(text(merge_sql))
    logger.info("Merged staging into main table using ON CONFLICT upsert.")


@celery_app.task(name="process_csv_import")
def process_csv_import(import_job_id: str, file_path: str):
    """
    Process CSV import asynchronously using preprocess -> COPY -> MERGE flow.

    Steps:
    1. Preprocess CSV (dedupe by case-insensitive SKU, last occurrence wins).
    2. Recreate and truncate staging table.
    3. Stream CSV in batches to temp CSV files and COPY to staging.
    4. Single MERGE from staging -> products.
    5. Cleanup and webhook.
    """
    db = SessionLocal()
    import_job = None
    deduped_file = None

    try:
        logger.info(f"[Import {import_job_id}] Starting CSV import processing (COPY path)")
        import_job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
        if not import_job:
            logger.error(f"[Import {import_job_id}] Import job not found")
            return

        # Update status to parsing
        logger.info(f"[Import {import_job_id}] Status: PENDING -> PARSING")
        import_job.status = ImportStatus.PARSING
        import_job.started_at = datetime.utcnow()
        db.commit()
        db.refresh(import_job)

        # 1) Preprocess CSV to dedupe by SKU (case-insensitive)
        logger.info(f"[Import {import_job_id}] Preprocessing CSV to dedupe by SKU (case-insensitive)")
        deduped_file = preprocess_dedupe_csv(file_path)
        logger.info(f"[Import {import_job_id}] Deduped CSV written to: {deduped_file}")

        # Ensure staging exists cleanly
        ensure_staging_table_exists()
        truncate_staging_table()

        # Detect dialect from deduped file
        with open(deduped_file, "r", encoding="utf-8", newline="") as hf:
            sample = hf.read(4096)
            hf.seek(0)
            try:
                sniffed = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
                dialect = sniffed
            except Exception:
                dialect = csv.excel

        # Compute total_records by iterating deduped CSV
        total_records = 0
        with open(deduped_file, "r", encoding="utf-8", newline="") as fcount:
            rdr = csv.DictReader(fcount, dialect=dialect)
            # handle single-field header if necessary
            if rdr.fieldnames and len(rdr.fieldnames) == 1:
                single = rdr.fieldnames[0]
                for delim in [",", ";", "\t", "|"]:
                    if delim in single:
                        fcount.seek(0)
                        rdr = csv.DictReader(
                            fcount, fieldnames=[h.strip() for h in single.split(delim)], dialect=dialect
                        )
                        next(rdr, None)
                        break
            for _ in rdr:
                total_records += 1

        import_job.total_records = total_records
        import_job.status = ImportStatus.VALIDATING
        db.commit()
        db.refresh(import_job)
        logger.info(f"[Import {import_job_id}] Scanned total records (deduped): {total_records}")

        import_job.status = ImportStatus.IMPORTING
        db.commit()
        db.refresh(import_job)

        # Stream rows and batch COPY
        batch_size = 50000  # tune as needed
        processed = 0
        skipped = 0
        start_time = datetime.utcnow()

        with open(deduped_file, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f, dialect=dialect)
            # handle single-field header if necessary
            if reader.fieldnames and len(reader.fieldnames) == 1:
                single = reader.fieldnames[0]
                for delim in [",", ";", "\t", "|"]:
                    if delim in single:
                        f.seek(0)
                        reader = csv.DictReader(f, fieldnames=[h.strip() for h in single.split(delim)], dialect=dialect)
                        next(reader, None)
                        break

            batch_rows = []
            batch_count = 0

            def flush_batch_to_staging(rows):
                if not rows:
                    return 0
                tmp = tempfile.NamedTemporaryFile(mode="w", delete=False, newline="", encoding="utf-8")
                tmp_name = tmp.name
                try:
                    writer = csv.writer(tmp)
                    writer.writerow(COLUMNS)
                    for r in rows:
                        row_vals = []
                        for col in COLUMNS:
                            if col == "is_active":
                                v = r.get(col)
                                if v in (None, ""):
                                    v = True
                                elif isinstance(v, str):
                                    if v.strip().lower() in ("true", "1", "yes", "y"):
                                        v = True
                                    elif v.strip().lower() in ("false", "0", "no", "n"):
                                        v = False
                                row_vals.append(v)
                            else:
                                v = r.get(col)
                                if v is None:
                                    row_vals.append("")
                                else:
                                    row_vals.append(v)
                        writer.writerow(row_vals)
                    tmp.flush()
                    tmp.close()

                    copy_csv_file_to_staging(tmp_name)
                    return len(rows)
                finally:
                    try:
                        os.unlink(tmp_name)
                    except Exception:
                        pass

            for orig_row in reader:
                # normalize keys
                normalized = {}
                for orig_key, value in orig_row.items():
                    if orig_key is None:
                        continue
                    clean_key = orig_key.strip().strip('"').strip("'").lower()
                    normalized[clean_key] = value

                mapped = {}
                mapped["sku"] = (normalized.get("sku") or "").strip()
                mapped["name"] = (normalized.get("name") or "").strip()
                mapped["description"] = (normalized.get("description") or normalized.get("desc") or "").strip()
                price_val = normalized.get("price")
                if price_val:
                    try:
                        price = float(str(price_val).strip().replace("$", "").replace(",", ""))
                    except Exception:
                        price = 0.0
                else:
                    price = 0.0
                mapped["price"] = price
                mapped["is_active"] = normalized.get("is_active", True)

                if not mapped["sku"] or not mapped["name"]:
                    skipped += 1
                    processed += 1
                    if processed % 1000 == 0:
                        import_job.processed_records = processed
                        db.commit()
                        db.refresh(import_job)
                    continue

                batch_rows.append(mapped)

                if len(batch_rows) >= batch_size:
                    batch_count += 1
                    logger.info(
                        f"[Import {import_job_id}] Flushing batch {batch_count} ({len(batch_rows)} rows) to staging via COPY"
                    )
                    copied = flush_batch_to_staging(batch_rows)
                    processed += copied
                    batch_rows = []

                    elapsed = (datetime.utcnow() - start_time).total_seconds()
                    rate = elapsed / processed if processed > 0 else None
                    remaining = max(total_records - processed, 0)
                    eta_seconds = int(rate * remaining) if rate else -1
                    if hasattr(import_job, "eta_seconds"):
                        try:
                            import_job.eta_seconds = eta_seconds if eta_seconds >= 0 else None
                        except Exception:
                            pass
                    import_job.processed_records = processed
                    db.commit()
                    db.refresh(import_job)
                    logger.info(
                        f"[Import {import_job_id}] Progress streamed to staging: {processed}/{total_records} (ETA {eta_seconds}s)"
                    )

            # flush remainder
            if batch_rows:
                batch_count += 1
                logger.info(
                    f"[Import {import_job_id}] Flushing final batch {batch_count} ({len(batch_rows)} rows) to staging via COPY"
                )
                copied = flush_batch_to_staging(batch_rows)
                processed += copied
                batch_rows = []
                elapsed = (datetime.utcnow() - start_time).total_seconds()
                rate = elapsed / processed if processed > 0 else None
                remaining = max(total_records - processed, 0)
                eta_seconds = int(rate * remaining) if rate else -1
                if hasattr(import_job, "eta_seconds"):
                    try:
                        import_job.eta_seconds = eta_seconds if eta_seconds >= 0 else None
                    except Exception:
                        pass
                import_job.processed_records = processed
                db.commit()
                db.refresh(import_job)
                logger.info(
                    f"[Import {import_job_id}] Progress streamed to staging: {processed}/{total_records} (ETA {eta_seconds}s)"
                )

        # All rows copied into staging, now merge
        logger.info(f"[Import {import_job_id}] Starting MERGE from staging -> main (single upsert)")
        merge_start = datetime.utcnow()
        merge_staging_to_main()
        merge_elapsed = (datetime.utcnow() - merge_start).total_seconds()
        logger.info(f"[Import {import_job_id}] MERGE completed in {merge_elapsed:.1f}s")

        # Finalize import_job
        import_job.processed_records = processed
        import_job.total_records = total_records
        import_job.status = ImportStatus.COMPLETED
        import_job.completed_at = datetime.utcnow()
        if hasattr(import_job, "eta_seconds"):
            try:
                import_job.eta_seconds = 0
            except Exception:
                pass
        db.commit()
        db.refresh(import_job)

        logger.info(
            f"[Import {import_job_id}] ✅ IMPORT COMPLETED SUCCESSFULLY\n"
            f"  - Total records: {total_records}\n"
            f"  - Streamed to staging: {processed}\n"
            f"  - Completion time: {import_job.completed_at}"
        )

        # Clean up staging table (truncate only; keep schema for reuse)
        truncate_staging_table()

        # Trigger webhook
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            payload = {
                "import_id": import_job_id,
                "total_records": total_records,
                "processed_records": processed,
                "created": None,
                "updated": None,
            }
            loop.run_until_complete(trigger_webhook("ImportCompleted", payload))
        finally:
            try:
                loop.close()
            except Exception:
                pass

    except Exception as e:
        logger.error(f"[Import {import_job_id}] ❌ IMPORT FAILED: {e}", exc_info=True)
        if import_job:
            try:
                import_job.status = ImportStatus.FAILED
                import_job.error_message = str(e)
                import_job.completed_at = datetime.utcnow()
                db.commit()
                db.refresh(import_job)
                logger.error(f"[Import {import_job_id}] Error details saved to database")
            except Exception as db_e:
                logger.error(f"[Import {import_job_id}] Failed to persist failure info: {db_e}", exc_info=True)
    finally:
        # Clean up uploaded CSV and deduped temp file
        if deduped_file and os.path.exists(deduped_file):
            try:
                os.unlink(deduped_file)
            except Exception:
                pass

        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception:
                logger.debug(f"Could not delete original uploaded file: {file_path}")

        db.close()
