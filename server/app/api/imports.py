from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import os
import tempfile
import logging

from app.database import get_db
from app.models import ImportJob, ImportStatus
from app.schemas import ImportJobResponse
from app.tasks import process_csv_import
from app.webhook_service import trigger_webhook

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB


@router.post("/upload", response_model=ImportJobResponse, status_code=201)
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload and process a CSV file"""
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    # Validate file size
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File size exceeds maximum of {MAX_FILE_SIZE / (1024*1024)}MB")
    
    if file_size == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    
    # Create import job record
    import_job = ImportJob(
        file_name=file.filename,
        status=ImportStatus.PENDING
    )
    db.add(import_job)
    db.commit()
    db.refresh(import_job)
    
    # Save file temporarily
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.csv')
    temp_file.write(file_content)
    temp_file.close()
    
    # Trigger webhook
    await trigger_webhook("ImportStarted", {
        "import_id": str(import_job.id),
        "file_name": file.filename
    })
    
    # Dispatch async task
    try:
        process_csv_import.delay(str(import_job.id), temp_file.name)
        logger.info(f"CSV import task dispatched for job {import_job.id}, file: {file.filename}")
    except Exception as e:
        logger.error(f"Failed to dispatch Celery task: {e}")
        # Update job status to failed if task dispatch fails
        import_job.status = ImportStatus.FAILED
        import_job.error_message = f"Failed to start import task: {str(e)}"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to start import: {str(e)}")
    
    return import_job


@router.get("/{import_id}/status", response_model=ImportJobResponse)
async def get_import_status(import_id: UUID, db: Session = Depends(get_db)):
    """Get the status of an import job"""
    import_job = db.query(ImportJob).filter(ImportJob.id == import_id).first()
    if not import_job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return import_job


@router.get("", response_model=List[ImportJobResponse])
async def list_imports(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List recent import jobs"""
    from sqlalchemy import desc
    # Order by created_at (most recent first)
    imports = db.query(ImportJob).order_by(desc(ImportJob.created_at)).limit(limit).all()
    return imports

