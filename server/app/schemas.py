from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from decimal import Decimal
from app.models import ImportStatus
from pydantic import ConfigDict


class ProductBase(BaseModel):
    sku: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    price: Decimal = Field(default=0.00, ge=0)
    is_active: bool = True

    @validator('sku')
    def sku_alphanumeric(cls, v):
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError('SKU must be alphanumeric (with dashes/underscores allowed)')
        return v


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(None, ge=0)
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    items: List[ProductResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ImportJobResponse(BaseModel):
    id: UUID
    file_name: Optional[str] = None
    total_records: int
    processed_records: int
    status: ImportStatus
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WebhookBase(BaseModel):
    url: str = Field(..., min_length=1, max_length=500)
    event_types: List[str] = []
    is_enabled: bool = True

    @validator('url')
    def url_valid(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('URL must start with http:// or https://')
        return v


class WebhookCreate(WebhookBase):
    pass


class WebhookUpdate(BaseModel):
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    event_types: Optional[List[str]] = None
    is_enabled: Optional[bool] = None


class WebhookResponse(WebhookBase):
    id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WebhookEvent(BaseModel):
    event_type: str
    timestamp: str
    data: dict

