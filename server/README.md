# Acme Inc. Product Importer Application

A scalable, high-performance web application for importing product data from large CSV files into a relational database. Built with FastAPI, PostgreSQL, Celery, and Redis.

## Features

- **CSV File Upload**: Upload and process CSV files up to 500MB with 500K+ records
- **Real-time Progress Tracking**: Monitor import progress with live updates
- **Duplicate Detection**: Automatically detects and overwrites duplicate products by SKU (case-insensitive)
- **Product Management**: Full CRUD operations for products with filtering and pagination
- **Bulk Delete**: Delete all products with confirmation
- **Webhook Support**: Configure webhooks for event-driven integrations with retry logic
- **Async Processing**: Background task processing using Celery for non-blocking operations

## Tech Stack

- **Backend**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL
- **Task Queue**: Celery with Redis
- **ORM**: SQLAlchemy
- **Migrations**: Alembic
- **Frontend**: React (Vite) with Tailwind CSS

## Prerequisites

- Python 3.11+
- PostgreSQL 15+
- Redis
- Node.js 18+ (for frontend development/build tooling)
- Docker and Docker Compose (optional, for containerized deployment)

## Installation

### Option 1: Docker Compose (Recommended)

1. Clone the repository
2. Copy `.env.example` to `.env` and update if needed
3. Run:
```bash
docker-compose up -d
```

This will build the React frontend, then start:
- PostgreSQL database
- Redis
- FastAPI web server
- Celery worker

The application will be available at `http://localhost:8000`

### Option 2: Local Development

1. Install backend dependencies:
```bash
pip install -r requirements.txt
```

2. Set up PostgreSQL database:
```bash
createdb product_importer
```

3. Set environment variables:
```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/product_importer
export REDIS_URL=redis://localhost:6379/0
```

Or create a `.env` file:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/product_importer
REDIS_URL=redis://localhost:6379/0
```

4. Run database migrations:
```bash
alembic upgrade head
```

5. Install frontend dependencies and start the Vite dev server (runs on http://localhost:5173 by default):
```bash
cd frontend
npm install
npm run dev
```

6. Start Redis:
```bash
redis-server
```

7. Start Celery worker (in a separate terminal):
```bash
celery -A app.tasks.celery_app worker --loglevel=info
```

8. Start the FastAPI server:
```bash
uvicorn app.main:app --reload
```

When running the Vite dev server, the React app proxies API calls to `http://localhost:8000`. For a production build, run:
```bash
cd frontend
npm run build
```
The compiled assets will be generated in `frontend/dist` and served directly by FastAPI.

## Usage

### Access the Application

Open your browser and navigate to `http://localhost:8000`

### Upload CSV File

1. Click on the upload area or drag and drop a CSV file
2. The CSV should have columns: `sku`, `name`, `description` (optional), `price` (optional)
3. Monitor the progress bar for real-time import status
4. Once complete, products will appear in the product management table

### Manage Products

- **View Products**: Browse products with pagination (20 per page)
- **Filter Products**: Use filters for SKU, Name, Description, and Active Status
- **Add Product**: Click "Add Product" button to create a new product
- **Edit Product**: Click "Edit" on any product row
- **Delete Product**: Click "Delete" on any product row
- **Bulk Delete**: Click "Delete All Products" to remove all products (with confirmation)

### Configure Webhooks

1. Click "Add Webhook" to create a new webhook
2. Enter the webhook URL
3. Optionally specify event types (comma-separated): `ProductCreated`, `ProductUpdated`, `ProductDeleted`, `ImportStarted`, `ImportCompleted`
4. Leave event types empty to receive all events
5. Test webhooks using the "Test" button

## API Documentation

Interactive API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Endpoints

### Products
- `GET /api/products` - List products (with filters and pagination)
- `POST /api/products` - Create product
- `GET /api/products/{id}` - Get product details
- `PUT /api/products/{id}` - Update product
- `DELETE /api/products/{id}` - Delete product
- `DELETE /api/products` - Bulk delete all products

### Imports
- `POST /api/imports/upload` - Upload CSV file
- `GET /api/imports/{import_id}/status` - Get import progress
- `GET /api/imports` - List import history

### Webhooks
- `POST /api/webhooks` - Create webhook
- `GET /api/webhooks` - List webhooks
- `GET /api/webhooks/{id}` - Get webhook details
- `PUT /api/webhooks/{id}` - Update webhook
- `DELETE /api/webhooks/{id}` - Delete webhook
- `POST /api/webhooks/{id}/test` - Test webhook

## CSV Format

The CSV file should have the following columns:

- `sku` (required): Unique product identifier (case-insensitive)
- `name` (required): Product name
- `description` (optional): Product description
- `price` (optional): Product price (defaults to 0.00)

Example:
```csv
sku,name,description,price
ABC-123,Product Name,Product description,29.99
XYZ-456,Another Product,Another description,49.99
```

## Webhook Events

Webhooks are triggered for the following events:

- `ProductCreated`: When a new product is created
- `ProductUpdated`: When a product is updated
- `ProductDeleted`: When a product is deleted
- `ImportStarted`: When a CSV import starts
- `ImportCompleted`: When a CSV import completes

Webhook payload format:
```json
{
  "event_type": "ProductCreated",
  "timestamp": "2025-11-13T10:00:00.000000",
  "data": {
    "product_id": "uuid",
    "sku": "ABC-123",
    "name": "Product Name",
    "action": "create"
  }
}
```

## Database Schema

### Products Table
- `id` (UUID, primary key)
- `sku` (String, unique, case-insensitive)
- `name` (String)
- `description` (Text)
- `price` (Decimal)
- `is_active` (Boolean)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

### ImportJobs Table
- `id` (UUID, primary key)
- `file_name` (String)
- `total_records` (Integer)
- `processed_records` (Integer)
- `status` (Enum: pending, parsing, validating, importing, completed, failed)
- `error_message` (Text)
- `started_at` (Timestamp)
- `completed_at` (Timestamp)

### Webhooks Table
- `id` (UUID, primary key)
- `url` (String)
- `event_types` (Array of strings)
- `is_enabled` (Boolean)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## Development

### Running Tests

```bash
pytest
```

### Database Migrations

Create a new migration:
```bash
alembic revision --autogenerate -m "Description"
```

Apply migrations:
```bash
alembic upgrade head
```

Rollback migration:
```bash
alembic downgrade -1
```

## Performance

- CSV import speed: 10,000+ records/minute
- Handles 500K+ records per upload
- API response time: <500ms (95th percentile)
- Supports 50+ concurrent uploads

## Security Considerations

- File type and size validation on upload
- SQL injection protection via SQLAlchemy ORM
- Input validation on all API endpoints
- HTTPS recommended for production

## License

This project is proprietary software for Acme Inc.

## Support

For issues or questions, please contact the development team.

