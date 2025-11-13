# Quick Start Guide

## Prerequisites

- Docker and Docker Compose installed
- OR
  - Python 3.11+
  - PostgreSQL 15+
  - Redis
  - Node.js 18+ (for the React frontend)

## Option 1: Docker Compose (Easiest)

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **Run database migrations:**
   ```bash
   docker-compose exec web alembic upgrade head
   ```

3. **Access the application:**
   - Web UI: http://localhost:8000
   - API Docs: http://localhost:8000/docs

4. **Stop services:**
   ```bash
   docker-compose down
   ```

## Option 2: Local Development

1. **Install backend dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up environment:**
   ```bash
   # Create .env file
   echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/product_importer" > .env
   echo "REDIS_URL=redis://localhost:6379/0" >> .env
   ```

3. **Start PostgreSQL and Redis:**
   ```bash
   # PostgreSQL (create database first)
   createdb product_importer
   
   # Redis
   redis-server
   ```

4. **Run migrations:**
   ```bash
   alembic upgrade head
   ```

5. **Install frontend dependencies and start the Vite dev server:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

6. **Start Celery worker (in separate terminal):**
   ```bash
   celery -A app.tasks.celery_app worker --loglevel=info
   ```

7. **Start the server:**
   ```bash
   python run.py
   # OR
   uvicorn app.main:app --reload
   ```

For a production build of the frontend (served directly by FastAPI):
```bash
cd frontend
npm run build
```

## Testing the Application

1. **Upload CSV:**
   - Navigate to http://localhost:8000
   - Click "Select File" or drag and drop `products.csv`
   - Watch the progress bar for real-time updates

2. **Manage Products:**
   - View products in the table
   - Use filters to search
   - Click "Add Product" to create new products
   - Click "Edit" or "Delete" on any product row

3. **Configure Webhooks:**
   - Click "Add Webhook"
   - Enter a webhook URL (e.g., https://webhook.site/your-unique-id)
   - Select event types or leave empty for all events
   - Click "Test" to verify webhook delivery

## API Testing

Visit http://localhost:8000/docs for interactive API documentation.

### Example API Calls

**List Products:**
```bash
curl http://localhost:8000/api/products?page=1&page_size=20
```

**Create Product:**
```bash
curl -X POST http://localhost:8000/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku": "TEST-001", "name": "Test Product", "price": 29.99}'
```

**Upload CSV:**
```bash
curl -X POST http://localhost:8000/api/imports/upload \
  -F "file=@products.csv"
```

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env file
- Verify database exists: `psql -l | grep product_importer`

### Redis Connection Error
- Ensure Redis is running: `redis-cli ping`
- Check REDIS_URL in .env file

### Import Not Processing
- Check Celery worker is running
- Check worker logs for errors
- Verify Redis is accessible

### Frontend Not Loading
- Check browser console for errors
- Verify `/assets/*` files are being served (if running without the Vite dev server, build the frontend with `npm run build`)
- Check FastAPI logs for static file serving issues

## Next Steps

- Review the full README.md for detailed documentation
- Check PSD-Product-Spec.md and TSD-Technical-Spec.md for requirements
- Explore the API documentation at /docs
- Test with the provided products.csv file

