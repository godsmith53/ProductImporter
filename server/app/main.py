from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.database import engine, Base
from app.api import products, imports, webhooks

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Acme Inc. Product Importer API",
    description="Product import and management system",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(products.router, prefix="/api/products", tags=["products"])
app.include_router(imports.router, prefix="/api/imports", tags=["imports"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])

# Serve static files from React build if available
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
build_dir = frontend_dir / "dist"

if (build_dir / "assets").exists():
    app.mount("/assets", StaticFiles(directory=build_dir / "assets"), name="assets")


@app.get("/")
async def root():
    """Serve the main HTML page"""
    index_path = build_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Product Importer API", "docs": "/docs"}


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}

