from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, List
from uuid import UUID

from app.database import get_db
from app.models import Product
from app.schemas import ProductCreate, ProductUpdate, ProductResponse, ProductListResponse
from app.webhook_service import trigger_webhook

router = APIRouter()


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Create a new product"""
    # Check for duplicate SKU (case-insensitive)
    existing = db.query(Product).filter(
        func.lower(Product.sku) == func.lower(product.sku)
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Product with SKU '{product.sku}' already exists")
    
    db_product = Product(**product.dict())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    
    # Trigger webhook
    await trigger_webhook("ProductCreated", {
        "product_id": str(db_product.id),
        "sku": db_product.sku,
        "name": db_product.name,
        "action": "create"
    })
    
    return db_product


@router.get("", response_model=ProductListResponse)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sku: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """List products with filtering and pagination"""
    query = db.query(Product)
    
    # Apply filters
    if sku:
        query = query.filter(func.lower(Product.sku).contains(func.lower(sku)))
    if name:
        query = query.filter(func.lower(Product.name).contains(func.lower(name)))
    if description:
        query = query.filter(func.lower(Product.description).contains(func.lower(description)))
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * page_size
    products = query.order_by(Product.created_at.desc()).offset(offset).limit(page_size).all()
    
    total_pages = (total + page_size - 1) // page_size
    
    return ProductListResponse(
        items=products,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: UUID, db: Session = Depends(get_db)):
    """Get a single product by ID"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    product_update: ProductUpdate,
    db: Session = Depends(get_db)
):
    """Update a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = product_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)
    
    db.commit()
    db.refresh(product)
    
    # Trigger webhook
    await trigger_webhook("ProductUpdated", {
        "product_id": str(product.id),
        "sku": product.sku,
        "name": product.name,
        "action": "update"
    })
    
    return product


@router.delete("/{product_id}", status_code=204)
async def delete_product(product_id: UUID, db: Session = Depends(get_db)):
    """Delete a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product_sku = product.sku
    product_name = product.name
    
    db.delete(product)
    db.commit()
    
    # Trigger webhook
    await trigger_webhook("ProductDeleted", {
        "product_id": str(product_id),
        "sku": product_sku,
        "name": product_name,
        "action": "delete"
    })
    
    return None


@router.delete("", status_code=200)
async def delete_all_products(db: Session = Depends(get_db)):
    """Bulk delete all products"""
    count = db.query(Product).count()
    db.query(Product).delete()
    db.commit()
    
    return {"message": f"Deleted {count} products"}

