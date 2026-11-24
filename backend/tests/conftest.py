import os
import tempfile

import pytest

_directory = tempfile.TemporaryDirectory(prefix="inventory-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_directory.name}/test.db"

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
