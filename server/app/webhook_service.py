from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Webhook
from app.schemas import WebhookEvent
from datetime import datetime
import httpx
import asyncio
import logging

logger = logging.getLogger(__name__)


async def trigger_webhook(event_type: str, data: dict):
    """Trigger webhooks for a given event type"""
    db = SessionLocal()
    try:
        # Find enabled webhooks that subscribe to this event type
        webhooks = db.query(Webhook).filter(
            Webhook.is_enabled == True
        ).all()
        
        matching_webhooks = [
            w for w in webhooks
            if not w.event_types or event_type in w.event_types
        ]
        
        # Send webhooks asynchronously (fire and forget)
        for webhook in matching_webhooks:
            asyncio.create_task(send_webhook(webhook.url, event_type, data))
            
    except Exception as e:
        logger.error(f"Error triggering webhooks: {e}")
    finally:
        db.close()


async def send_webhook(url: str, event_type: str, data: dict, retry_count: int = 0):
    """Send a webhook with retry logic"""
    max_retries = 3
    base_delay = 1  # seconds
    
    event = WebhookEvent(
        event_type=event_type,
        timestamp=datetime.utcnow().isoformat(),
        data=data
    )
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                url,
                json=event.dict(),
                headers={"Content-Type": "application/json"}
            )
            
            # Success if status code is 2xx
            if 200 <= response.status_code < 300:
                logger.info(f"Webhook delivered successfully to {url}")
                return
            
            # Retry on failure
            if retry_count < max_retries:
                delay = base_delay * (2 ** retry_count)  # Exponential backoff
                logger.warning(
                    f"Webhook failed (status {response.status_code}), "
                    f"retrying in {delay}s (attempt {retry_count + 1}/{max_retries})"
                )
                await asyncio.sleep(delay)
                await send_webhook(url, event_type, data, retry_count + 1)
            else:
                logger.error(f"Webhook failed after {max_retries} retries: {url}")
                
    except Exception as e:
        if retry_count < max_retries:
            delay = base_delay * (2 ** retry_count)
            logger.warning(
                f"Webhook error: {e}, retrying in {delay}s "
                f"(attempt {retry_count + 1}/{max_retries})"
            )
            await asyncio.sleep(delay)
            await send_webhook(url, event_type, data, retry_count + 1)
        else:
            logger.error(f"Webhook error after {max_retries} retries: {url}, error: {e}")

