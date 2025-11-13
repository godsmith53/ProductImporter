"""add eta_seconds to import_jobs

Revision ID: 003_add_eta_seconds
Revises: 002_add_created_at
Create Date: 2025-11-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_add_eta_seconds'
down_revision = '002_add_created_at'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add eta_seconds column (nullable integer)
    op.add_column('import_jobs', sa.Column('eta_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('import_jobs', 'eta_seconds')
