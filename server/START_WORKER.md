# Starting the Celery Worker

The Celery worker processes CSV import tasks in the background. **You must start the worker for imports to process.**

## Quick Start

In a **separate terminal/PowerShell window**, run:

```powershell
python celery_worker.py
```

Or directly with Celery:

```powershell
celery -A app.tasks.celery_app worker --loglevel=info
```

## Prerequisites

1. **Redis must be running** (the worker needs Redis to receive tasks)
   - Check Redis: `redis-cli ping` (should return `PONG`)
   - Start Redis if needed: `redis-server`

2. **Database must be accessible** (same connection as FastAPI)

3. **Environment variables** should be set (same `.env` file as FastAPI)

## What You'll See

When the worker is running, you'll see logs like:

```
[INFO] [Import abc-123] Starting CSV import processing
[INFO] [Import abc-123] Status: PENDING -> PARSING
[INFO] [Import abc-123] Reading CSV file: /tmp/xyz.csv
[INFO] [Import abc-123] Parsed 1000 records from CSV
[INFO] [Import abc-123] Progress: 50/1000 (5.0%) - Created: 30, Updated: 20, Skipped: 0
...
[INFO] [Import abc-123] ✅ IMPORT COMPLETED SUCCESSFULLY
```

## Troubleshooting

### Worker not processing tasks
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` in `.env` matches Redis connection
- Check worker logs for errors

### Tasks stuck in PENDING
- Worker is not running - start it using the command above
- Check Redis connection
- Verify database connection

### Import fails immediately
- Check worker logs for error messages
- Verify CSV file format (must have `sku` and `name` columns)
- Check database connection from worker

## Running in Production

For production, use a process manager like:
- **systemd** (Linux)
- **supervisor**
- **PM2**
- **Docker Compose** (already configured in `docker-compose.yml`)

