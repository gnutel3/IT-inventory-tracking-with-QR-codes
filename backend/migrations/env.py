from alembic import context
from app.database import Base
from app import models

connection = context.config.attributes.get("connection")
if connection is None:
    raise RuntimeError("Запускайте миграции командой python -m app.db_tools upgrade.")
context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True, render_as_batch=True)
with context.begin_transaction():
    context.run_migrations()
