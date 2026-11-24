"""Adopt a verified stage-6 database or create a new one."""
from alembic import op
from sqlalchemy import inspect
from migrations.stage6_schema import metadata, validate_existing

revision = "0001_stage6"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    existing = set(inspect(connection).get_table_names()) - {"alembic_version"}
    if existing:
        validate_existing(connection)
    else:
        metadata.create_all(connection)


def downgrade():
    raise RuntimeError("Автоматическое удаление данных запрещено. Восстановите проверенную копию отдельно.")
