from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory


def migration_config():
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    return config


def current_revision(engine):
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def head_revision():
    return ScriptDirectory.from_config(migration_config()).get_current_head()


def require_current(engine):
    if current_revision(engine) != head_revision():
        raise RuntimeError("Сначала из backend выполните: py -m app.db_tools upgrade. Рабочую базу не удаляйте.")


def run_upgrade(engine):
    config = migration_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
