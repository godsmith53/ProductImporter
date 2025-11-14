# ---- Builder stage: copy repo, build frontend if present, prepare artifact ----
FROM node:18-alpine AS builder
WORKDIR /src

# Copy whole repo into builder (use Docker cache wisely)
COPY . /src

# Build frontend if a frontend folder exists or top-level package.json exists
RUN set -eux; \
    if [ -d "/src/frontend" ]; then \
        echo "Building frontend from /src/frontend"; \
        cd /src/frontend && npm ci && npm run build && mkdir -p /src/dist && cp -a dist /src/dist; \
    elif [ -f "/src/package.json" ] && [ -d "/src/src" ]; then \
        echo "Building frontend from repo root"; \
        cd /src && npm ci && npm run build && mkdir -p /src/dist && cp -a dist /src/dist; \
    else \
        echo "No frontend build found; creating empty /src/dist"; mkdir -p /src/dist; \
    fi

# Prepare artifact folder with only the backend files we need
RUN set -eux; \
    rm -rf /artifact; mkdir -p /artifact; \
    if [ -f /src/server/requirements.txt ]; then cp /src/server/requirements.txt /artifact/requirements.txt; \
    elif [ -f /src/requirements.txt ]; then cp /src/requirements.txt /artifact/requirements.txt; fi; \
    if [ -d /src/server/app ]; then cp -a /src/server/app /artifact/app; \
    elif [ -d /src/app ]; then cp -a /src/app /artifact/app; fi; \
    if [ -d /src/server/alembic ]; then cp -a /src/server/alembic /artifact/alembic; fi; \
    if [ -f /src/server/alembic.ini ]; then cp /src/server/alembic.ini /artifact/alembic.ini; fi; \
    if [ -f /src/alembic.ini ]; then cp /src/alembic.ini /artifact/alembic.ini; fi; \
    if [ -f /src/server/run.py ]; then cp /src/server/run.py /artifact/run.py; fi; \
    if [ -f /src/run.py ]; then cp /src/run.py /artifact/run.py; fi; \
    if [ -f /src/server/celery_worker.py ]; then cp /src/server/celery_worker.py /artifact/celery_worker.py; fi; \
    if [ -f /src/celery_worker.py ]; then cp /src/celery_worker.py /artifact/celery_worker.py; fi; \
    if [ -f /src/server/.env ]; then cp /src/server/.env /artifact/.env; fi; \
    if [ -f /src/.env ]; then cp /src/.env /artifact/.env; fi; \
    if [ -d /src/dist ]; then cp -a /src/dist /artifact/dist; fi

# ---- Final runtime image ----
FROM python:3.11-slim
WORKDIR /app

# System packages required for psycopg2 and builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy prepared artifact from builder
COPY --from=builder /artifact /app

# If requirements.txt exists in /app, install dependencies
RUN set -eux; \
    if [ -f /app/requirements.txt ]; then \
        pip install --upgrade pip; \
        pip install --no-cache-dir -r /app/requirements.txt; \
    else \
        echo "No requirements.txt found in artifact; ensure dependencies are installed in other way"; \
    fi

# Move frontend dist into place (if present)
RUN if [ -d /app/dist ]; then mkdir -p /app/frontend/dist && cp -a /app/dist/* /app/frontend/dist/ || true; fi

EXPOSE 8000

# Run with gunicorn in production; expand ${PORT} at runtime
CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app -w 4 -b 0.0.0.0:${PORT:-8000}"]
# Alternative lightweight option:
# CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
