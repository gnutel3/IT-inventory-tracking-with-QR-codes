import argparse
import os
from pathlib import Path
import sqlite3
from datetime import datetime, timezone
from contextlib import closing

from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import SQLAlchemyError

from app.database import engine
from app.schema import current_revision, head_revision, require_current, run_upgrade
from migrations.stage6_schema import validate_existing

BACKUPS = Path(__file__).resolve().parents[1] / "backups"


def sqlite_path(database_engine=engine):
    if database_engine.dialect.name != "sqlite" or database_engine.url.database in (None, "", ":memory:"):
        raise RuntimeError("Эта команда копирования предназначена только для файловой SQLite. Для PostgreSQL нужен pg_dump.")
    return Path(database_engine.url.database).resolve()


def verify_file(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise RuntimeError(f"Файл не найден: {path}")
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise RuntimeError("Проверка SQLite integrity_check не пройдена.")
        if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise RuntimeError("Нарушены связи таблиц. Копия не прошла проверку.")
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        revision = db.execute("SELECT version_num FROM alembic_version").fetchall() if "alembic_version" in tables else []
        if revision and revision != [(head_revision(),)]:
            raise RuntimeError("Версия копии не поддерживается этой версией приложения.")
        counts = {}
        for table in ("devices", "users", "device_movements", "device_repairs", "inventory_checks"):
            if table not in tables:
                raise RuntimeError("Это не полная база этапа 6/7.")
            counts[table] = db.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
    test_engine = create_engine("sqlite:///" + path.as_posix())
    try:
        with test_engine.connect() as connection:
            validate_existing(connection)
    finally:
        test_engine.dispose()
    return {"revision": revision[0][0] if revision else "этап 6, без миграций", **counts}


def copy_sqlite(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if source == destination:
        raise RuntimeError("Источник и назначение не должны совпадать.")
    verify_file(source)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(destination)) as dst:
                src.backup(dst)
        verify_file(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return destination


def backup(database_engine=engine, output=None):
    source = sqlite_path(database_engine)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    destination = output or BACKUPS / f"inventory-{stamp}.db"
    return copy_sqlite(source, destination)


def restore_copy(source, destination):
    destination = Path(destination).resolve()
    if destination == sqlite_path():
        raise RuntimeError("Нельзя восстанавливать поверх рабочей базы. Выберите новый файл и остановите сервер.")
    path = copy_sqlite(source, destination)
    # Never revive old authenticated sessions when restoring a snapshot.
    with closing(sqlite3.connect(path)) as db:
        db.execute("DELETE FROM login_sessions")
        db.commit()
    verify_file(path)
    return path


def upgrade(database_engine=engine, backup_confirmed=False):
    if database_engine.dialect.name == "sqlite":
        path = sqlite_path(database_engine)
        if path.exists() and path.stat().st_size:
            if current_revision(database_engine) == head_revision():
                require_current(database_engine)
                print("Обновление не требуется.")
                return
            print(f"Копия перед обновлением: {backup(database_engine)}")
    else:
        with database_engine.connect() as connection:
            if inspect(connection).get_table_names() and not backup_confirmed:
                raise RuntimeError("Сначала сделайте и проверьте PostgreSQL-копию. Затем используйте --backup-confirmed.")
    run_upgrade(database_engine)
    require_current(database_engine)
    print(f"Миграции применены: {head_revision()}")


def main():
    parser = argparse.ArgumentParser(description="Миграции и копии базы IT Inventory")
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("status")
    upgrading = commands.add_parser("upgrade")
    upgrading.add_argument("--backup-confirmed", action="store_true")
    backing = commands.add_parser("backup")
    backing.add_argument("--output", type=Path)
    verifying = commands.add_parser("verify")
    verifying.add_argument("file", type=Path)
    restoring = commands.add_parser("restore-copy")
    restoring.add_argument("file", type=Path)
    restoring.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.action == "status":
            exists = engine.dialect.name != "sqlite" or sqlite_path().exists()
            print("База:", engine.url.render_as_string(hide_password=True))
            print("Текущая версия:", current_revision(engine) if exists else "файл ещё не создан")
            print("Версия приложения:", head_revision())
        elif args.action == "upgrade":
            upgrade(backup_confirmed=args.backup_confirmed)
        elif args.action == "backup":
            print("Копия создана:", backup(output=args.output))
        elif args.action == "verify":
            print("Копия проверена:", verify_file(args.file))
        else:
            print("Восстановлено в отдельный файл:", restore_copy(args.file, args.output))
    except (RuntimeError, OSError, sqlite3.Error, SQLAlchemyError) as error:
        parser.exit(1, f"Операция остановлена: {error}\n")


if __name__ == "__main__":
    main()
