# Dockerfile — robust for your repo layout (detects frontend folder and server/app)
# Stage 1: frontend build (only if frontend exists)
FROM node:18-alpine AS frontend-builder
WORKDIR /src

# Copy everything (we'll only build frontend if present)
COPY . /src

# Build frontend if a frontend directory exists OR if a top-level package.json exists
# Output dist into /dist for later COPY
RUN if [ -d "./frontend" ]; then \
      cd frontend && npm ci && npm run build && mv dist /dist ; \
    elif [ -f "./package.json" ]; then \
      npm ci && npm run build && mv dist /dist ; \
    else \
      echo "No frontend found, creating empty /dist" && mkdir /dist ; \
    fi

# Stage 2: backend runtime
FROM python:3.11-slim AS backend
WORKDIR /app

# System deps needed for many python packages and psycopg2
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt

# Copy backend code:
# Prefer server/ (your repo has server/app). If not present, fall back to app/ at repo root.
# We assume the multi-stage frontend build saved result at /dist on the builder image.
COPY --from=frontend-builder /dist ./frontend/dist

# Try copy from server/ first, else copy app/ from root location
# (We copy both so Docker caching is simple — the COPY below will succeed in either layout.)
COPY server/app ./app/ 2>/dev/null || true
COPY server/alembic ./alembic 2>/dev/null || true
COPY server/alembic.ini ./alembic.ini 2>/dev/null || true
COPY app ./app/ 2>/dev/null
COPY alembic ./alembic 2>/dev/null
COPY alembic.ini ./alembic.ini 2>/dev/null

# Copy common scripts if they exist in repo root or server/
COPY server/run.py ./run.py 2>/dev/null || true
COPY run.py ./run.py 2>/dev/null || true
COPY server/celery_worker.py ./celery_worker.py 2>/dev/null || true
COPY celery_worker.py ./celery_worker.py 2>/dev/null || true

# Expose default port (useful for local testing)
EXPOSE 8000

# Production command: expand ${PORT} at runtime (Railway injects PORT)
# Ensure gunicorn & uvicorn are present in requirements.txt
CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app -w 4 -b 0.0.0.0:${PORT:-8000}"]
