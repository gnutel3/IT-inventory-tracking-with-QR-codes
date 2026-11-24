import os
import tempfile

import pytest

_directory = tempfile.TemporaryDirectory(prefix="inventory-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_directory.name}/test.db"

from app.database import Base, engine
from app.main import app
from app.schema import run_upgrade
from sqlalchemy import text


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
    run_upgrade(engine)
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
