# Stage 1: frontend build
FROM node:18-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: backend runtime
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY run.py ./
COPY celery_worker.py ./

# Copy frontend build artifacts
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Expose default port (useful for local debugging)
EXPOSE 8000

# Production command:
# Use sh -c so ${PORT:-8000} expands at container start (when Railway injects $PORT).
# Use gunicorn with uvicorn workers for production. Ensure gunicorn & uvicorn are in requirements.txt.
CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker app.main:app -w 4 -b 0.0.0.0:${PORT:-8000}"]

# If you prefer a lighter uvicorn-only start (not recommended for production), use:
# CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
