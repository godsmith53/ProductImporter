"""Add created_at to import_jobs

Revision ID: 002_add_created_at
Revises: 001_initial
Create Date: 2025-11-13 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_add_created_at'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add created_at column to import_jobs if it doesn't exist
    op.execute("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'import_jobs' AND column_name = 'created_at'
            ) THEN
                ALTER TABLE import_jobs 
                ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_column('import_jobs', 'created_at')

