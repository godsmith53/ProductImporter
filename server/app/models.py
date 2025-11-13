# app/models.py

import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    String,
    Text,
    Numeric,
    Boolean,
    Integer,
    DateTime,
    Enum as SQLEnum,
    ARRAY,
)
from sqlalchemy.sql import func, text as sa_text
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


# ----------------------------------------------------------------------
# GUID Type (unchanged)
# ----------------------------------------------------------------------
class GUID(TypeDecorator):
    """
    Platform-independent GUID type.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(UUID())
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return str(value)
        if not isinstance(value, uuid.UUID):
            return str(uuid.UUID(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            return uuid.UUID(value)
        return value


# ----------------------------------------------------------------------
# Import Status Enum
# ----------------------------------------------------------------------
class ImportStatus(str, enum.Enum):
    PENDING = "pending"
    PARSING = "parsing"
    VALIDATING = "validating"
    IMPORTING = "importing"
    COMPLETED = "completed"
    FAILED = "failed"


# ----------------------------------------------------------------------
# Product Model
# ----------------------------------------------------------------------
class Product(Base):
    __tablename__ = "products"

    id = Column(
        GUID(),
        primary_key=True,
        server_default=sa_text("gen_random_uuid()"),   # DB-level default
        default=uuid.uuid4,                            # ORM fallback
    )

    sku = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Numeric(10, 2), default=0.00)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Product(sku={self.sku}, name={self.name})>"


# ----------------------------------------------------------------------
# Import Job Model
# ----------------------------------------------------------------------
class ImportJob(Base):
    __tablename__ = "import_jobs"

    id = Column(
        GUID(),
        primary_key=True,
        server_default=sa_text("gen_random_uuid()"),
        default=uuid.uuid4,
    )

    file_name = Column(String(255), nullable=True)

    total_records = Column(Integer, default=0)
    processed_records = Column(Integer, default=0)

    status = Column(SQLEnum(ImportStatus), default=ImportStatus.PENDING)

    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Newly added ETA field
    eta_seconds = Column(Integer, nullable=True)

    def __repr__(self):
        return f"<ImportJob(id={self.id}, status={self.status})>"


# ----------------------------------------------------------------------
# Webhook Model
# ----------------------------------------------------------------------
class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(
        GUID(),
        primary_key=True,
        server_default=sa_text("gen_random_uuid()"),
        default=uuid.uuid4,
    )

    url = Column(String(500), nullable=False)
    event_types = Column(ARRAY(String), default=[])
    is_enabled = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Webhook(url={self.url}, events={self.event_types})>"
