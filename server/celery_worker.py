#!/usr/bin/env python3
"""
Celery worker runner
Run this script to start the Celery worker that processes CSV imports.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    # Use subprocess to run celery command
    import subprocess
    subprocess.run([
        sys.executable, "-m", "celery",
        "-A", "app.tasks.celery_app",
        "worker",
        "--loglevel=info",
        "--pool=solo"  # Use solo pool for Windows compatibility
    ])

