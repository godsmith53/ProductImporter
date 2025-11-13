from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import httpx
import asyncio

from app.database import get_db
from app.models import Webhook
from app.schemas import WebhookCreate, WebhookUpdate, WebhookResponse, WebhookEvent
from datetime import datetime

router = APIRouter()


@router.post("", response_model=WebhookResponse, status_code=201)
async def create_webhook(webhook: WebhookCreate, db: Session = Depends(get_db)):
    """Create a new webhook"""
    db_webhook = Webhook(**webhook.dict())
    db.add(db_webhook)
    db.commit()
    db.refresh(db_webhook)
    return db_webhook


@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(db: Session = Depends(get_db)):
    """List all webhooks"""
    webhooks = db.query(Webhook).all()
    return webhooks


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(webhook_id: UUID, db: Session = Depends(get_db)):
    """Get a single webhook by ID"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


@router.put("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: UUID,
    webhook_update: WebhookUpdate,
    db: Session = Depends(get_db)
):
    """Update a webhook"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    update_data = webhook_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(webhook, field, value)
    
    db.commit()
    db.refresh(webhook)
    return webhook


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(webhook_id: UUID, db: Session = Depends(get_db)):
    """Delete a webhook"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    db.delete(webhook)
    db.commit()
    return None


@router.post("/{webhook_id}/test", status_code=200)
async def test_webhook(webhook_id: UUID, db: Session = Depends(get_db)):
    """Test a webhook by sending a test event"""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    if not webhook.is_enabled:
        raise HTTPException(status_code=400, detail="Webhook is disabled")
    
    # Create test event
    test_event = WebhookEvent(
        event_type="TestEvent",
        timestamp=datetime.utcnow().isoformat(),
        data={
            "message": "This is a test webhook event",
            "webhook_id": str(webhook.id)
        }
    )
    
    # Send webhook
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                webhook.url,
                json=test_event.dict(),
                headers={"Content-Type": "application/json"}
            )
            
            return {
                "status": "success",
                "response_code": response.status_code,
                "response_time_ms": response.elapsed.total_seconds() * 1000,
                "response_body": response.text[:500] if response.text else None
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Webhook test failed: {str(e)}")

