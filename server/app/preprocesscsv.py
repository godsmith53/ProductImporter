# app/preprocesscsv.py
import csv
import sqlite3
import tempfile
import os
from typing import Optional

def preprocess_dedupe_csv(input_path: str, output_path: Optional[str] = None, sku_column_names=None) -> str:
    """
    Read `input_path` CSV and write a deduplicated CSV to `output_path` (if provided)
    or a temp file. Keeps the LAST occurrence for each SKU (case-insensitive).
    Uses an on-disk sqlite DB (INSERT OR REPLACE) so memory use is small.

    Returns path to deduped CSV file (string).
    """

    if sku_column_names is None:
        sku_column_names = ['sku', 'product_sku', 'id', 'code']  # common names; detect case-insensitively

    if output_path is None:
        # make a temporary output file
        fd_out, output_path = tempfile.mkstemp(prefix="deduped_", suffix=".csv", text=True)
        os.close(fd_out)

    # create temporary sqlite DB file
    tmp_db_fd, tmp_db_path = tempfile.mkstemp(prefix="dedupe_db_", suffix=".sqlite")
    os.close(tmp_db_fd)

    conn = sqlite3.connect(tmp_db_path)
    try:
        cur = conn.cursor()

        # Speedups for temporary DB (less durability, faster writes)
        try:
            cur.execute("PRAGMA synchronous = OFF;")
            cur.execute("PRAGMA journal_mode = MEMORY;")
            cur.execute("PRAGMA temp_store = MEMORY;")
        except Exception:
            # PRAGMA might not be supported in some environments; ignore if they fail
            pass

        # table: sku_norm (primary key), row_text (csv row as text)
        cur.execute("CREATE TABLE dedupe (sku_norm TEXT PRIMARY KEY, row_text TEXT)")
        conn.commit()

        # First pass: stream read CSV and insert/replace rows keyed by normalized SKU
        with open(input_path, 'r', encoding='utf-8', newline='') as inf:
            # Use csv.Sniffer to detect dialect (helps with different delimiters)
            sample = inf.read(8192)
            inf.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=[',', ';', '\t', '|'])
            except Exception:
                dialect = csv.excel

            reader = csv.reader(inf, dialect=dialect)
            try:
                header = next(reader)
            except StopIteration:
                header = []

            # Determine SKU column index (case-insensitive)
            header_norm = [h.strip().lower() for h in header]
            sku_idx = None
            for name in sku_column_names:
                if name in header_norm:
                    sku_idx = header_norm.index(name)
                    break
            if sku_idx is None:
                # fallback: try any column called 'sku' ignoring suffixes
                if 'sku' in header_norm:
                    sku_idx = header_norm.index('sku')
                else:
                    raise ValueError("Could not find SKU column in CSV header. Header columns: " + ", ".join(header))

            def row_to_text(row):
                from io import StringIO
                buf = StringIO()
                w = csv.writer(buf, dialect=dialect)
                w.writerow(row)
                return buf.getvalue().rstrip("\r\n")

            insert_sql = "INSERT OR REPLACE INTO dedupe (sku_norm, row_text) VALUES (?, ?)"
            batch = []
            batch_size = 2000  # tuned for sqlite performance
            for row in reader:
                # pad short rows
                if len(row) < len(header):
                    row = row + [''] * (len(header) - len(row))

                sku_val = row[sku_idx].strip() if row[sku_idx] is not None else ""
                sku_norm = sku_val.lower()
                if sku_norm == "":
                    # skip empty SKUs
                    continue

                row_text = row_to_text(row)
                batch.append((sku_norm, row_text))

                if len(batch) >= batch_size:
                    cur.executemany(insert_sql, batch)
                    conn.commit()
                    batch = []

            if batch:
                cur.executemany(insert_sql, batch)
                conn.commit()

        # Second pass: write header + all deduped rows to output CSV
        with open(output_path, 'w', encoding='utf-8', newline='') as outf:
            writer = csv.writer(outf, dialect=dialect)
            writer.writerow(header)

            # iterate over dedupe table and write row_text back (ordered by sku_norm for determinism)
            for sku_norm, row_text in cur.execute("SELECT sku_norm, row_text FROM dedupe ORDER BY sku_norm"):
                from io import StringIO
                buf = StringIO(row_text)
                r = csv.reader(buf, dialect=dialect)
                row = next(r)
                writer.writerow(row)

    finally:
        conn.close()
        try:
            os.unlink(tmp_db_path)
        except Exception:
            pass

    return output_path
