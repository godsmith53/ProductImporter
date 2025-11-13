# app/tasks.py
from celery import Celery
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import SessionLocal, engine
from app.models import Product, ImportJob, ImportStatus
from app.webhook_service import trigger_webhook
import csv
import os
import logging
from datetime import datetime
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Celery configuration
celery_app = Celery(
    "product_importer",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379/0")
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)


@celery_app.task(name="process_csv_import")
def process_csv_import(import_job_id: str, file_path: str):
    """Process CSV import asynchronously"""
    db = SessionLocal()
    import_job = None

    try:
        logger.info(f"[Import {import_job_id}] Starting CSV import processing")
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

        # Parse CSV and count records
        logger.info(f"[Import {import_job_id}] Reading CSV file: {file_path}")
        records = []

        # Try different encodings to handle BOM and other issues
        encodings = ['utf-8-sig', 'utf-8', 'latin-1']
        fieldnames = None
        used_encoding = None

        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding, newline='') as f:
                    # Read a sample for sniffing (optional)
                    sample = f.read(4096)
                    f.seek(0)

                    # Try to detect delimiter/ dialect
                    try:
                        sniffed = csv.Sniffer().sniff(sample, delimiters=[',', ';', '\t', '|'])
                        dialect = sniffed
                    except Exception:
                        dialect = csv.excel

                    reader = csv.DictReader(f, dialect=dialect)
                    original_fieldnames = reader.fieldnames

                    # Fallback: if header seen as one field like ['sku,name,description']
                    if original_fieldnames and len(original_fieldnames) == 1:
                        single = original_fieldnames[0]
                        for delim in [',', ';', '\t', '|']:
                            if delim in single:
                                original_fieldnames = [h.strip() for h in single.split(delim)]
                                f.seek(0)
                                reader = csv.DictReader(f, fieldnames=original_fieldnames, dialect=dialect)
                                # skip the original header row since we've consumed it as fieldnames
                                next(reader, None)
                                break

                    if original_fieldnames:
                        # Clean up fieldnames: strip BOM, quotes, whitespace, lowercase
                        fieldnames = [field.strip().strip('"').strip("'").strip('\ufeff').lower() for field in original_fieldnames]

                        # Validate required columns (case-insensitive)
                        required_columns = {'sku', 'name'}
                        if not required_columns.issubset(set(fieldnames)):
                            raise ValueError(f"CSV missing required columns. Found: {fieldnames}, Required: {required_columns}")

                        logger.info(f"[Import {import_job_id}] CSV columns detected: {fieldnames} (original: {original_fieldnames}, encoding: {encoding})")

                        # Map original -> cleaned keys and read records
                        fieldname_map = dict(zip(original_fieldnames, fieldnames))

                        for row in reader:
                            normalized_row = {}
                            for orig_key, value in row.items():
                                if orig_key is None:
                                    continue
                                clean_key = fieldname_map.get(orig_key, orig_key.lower().strip().strip('"').strip("'"))
                                normalized_row[clean_key] = value
                            records.append(normalized_row)

                        used_encoding = encoding
                        break
            except ValueError:
                # Re-raise validation errors so they are recorded as import failures
                raise
            except Exception as e:
                logger.warning(f"[Import {import_job_id}] Failed to read with encoding {encoding}: {e}")
                continue

        if not fieldnames:
            raise ValueError(f"Failed to read CSV file with any encoding. Tried: {encodings}")

        total_records = len(records)
        logger.info(f"[Import {import_job_id}] Parsed {total_records} records from CSV")

        import_job.total_records = total_records
        import_job.status = ImportStatus.VALIDATING
        db.commit()
        db.refresh(import_job)
        logger.info(f"[Import {import_job_id}] Status: PARSING -> VALIDATING")

        # Update status to importing
        import_job.status = ImportStatus.IMPORTING
        db.commit()
        db.refresh(import_job)
        logger.info(f"[Import {import_job_id}] Status: VALIDATING -> IMPORTING")

        # Process records in batches
        batch_size = 1000
        processed = 0
        created = 0
        updated = 0
        skipped = 0

        logger.info(f"[Import {import_job_id}] Starting to process {total_records} records in batches of {batch_size}")

        for i in range(0, total_records, batch_size):
            batch = records[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (total_records + batch_size - 1) // batch_size

            logger.info(f"[Import {import_job_id}] Processing batch {batch_num}/{total_batches} ({len(batch)} records)")

            for row in batch:
                try:
                    sku_val = row.get('sku', '')
                    name_val = row.get('name', '')
                    desc_val = row.get('description') or row.get('desc')
                    price_val = row.get('price')

                    sku = (str(sku_val) if sku_val else '').strip().strip('"').strip("'")
                    name = (str(name_val) if name_val else '').strip().strip('"').strip("'")
                    description = (str(desc_val).strip().strip('"').strip("'") if desc_val else None)

                    price = 0.00
                    if price_val:
                        try:
                            price_str = str(price_val).strip().strip('"').strip("'").replace('$', '').replace(',', '').strip()
                            if price_str:
                                price = float(price_str)
                                if price < 0:
                                    price = 0.00
                        except (ValueError, TypeError):
                            price = 0.00

                    if not sku or not name:
                        logger.warning(f"[Import {import_job_id}] Skipping row {processed + 1}: missing SKU or name")
                        skipped += 1
                        continue

                    # Use sqlalchemy.func (not db.func)
                    existing = db.query(Product).filter(func.lower(Product.sku) == func.lower(sku)).first()

                    if existing:
                        existing.name = name
                        existing.description = description
                        existing.price = price
                        updated += 1
                    else:
                        new_product = Product(
                            sku=sku,
                            name=name,
                            description=description,
                            price=price,
                            is_active=True
                        )
                        db.add(new_product)
                        created += 1

                    processed += 1

                    if processed % 50 == 0:
                        import_job.processed_records = processed
                        db.commit()
                        db.refresh(import_job)
                        progress_pct = (processed / total_records * 100) if total_records > 0 else 0
                        logger.info(
                            f"[Import {import_job_id}] Progress: {processed}/{total_records} "
                            f"({progress_pct:.1f}%) - Created: {created}, Updated: {updated}, Skipped: {skipped}"
                        )

                except Exception as e:
                    logger.error(f"[Import {import_job_id}] Error processing row {processed + 1}: {e}")
                    skipped += 1
                    continue

            # Commit batch
            db.commit()
            logger.info(
                f"[Import {import_job_id}] Batch {batch_num}/{total_batches} completed. "
                f"Total progress: {processed}/{total_records} ({(processed/total_records*100) if total_records else 0:.1f}%)"
            )

        # Final update
        import_job.processed_records = processed
        import_job.status = ImportStatus.COMPLETED
        import_job.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(import_job)

        logger.info(
            f"[Import {import_job_id}] ✅ IMPORT COMPLETED SUCCESSFULLY\n"
            f"  - Total records: {total_records}\n"
            f"  - Processed: {processed}\n"
            f"  - Created: {created}\n"
            f"  - Updated: {updated}\n"
            f"  - Skipped: {skipped}\n"
            f"  - Completion time: {import_job.completed_at}"
        )

        # Trigger webhook (async in background) — ensure parentheses and braces are closed correctly
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            payload = {
                "import_id": import_job_id,
                "total_records": total_records,
                "processed_records": processed,
                "created": created,
                "updated": updated
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
            import_job.status = ImportStatus.FAILED
            import_job.error_message = str(e)
            import_job.completed_at = datetime.utcnow()
            db.commit()
            db.refresh(import_job)
            logger.error(f"[Import {import_job_id}] Error details saved to database")
    finally:
        # Clean up temp file
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file {file_path}: {e}")

        db.close()
