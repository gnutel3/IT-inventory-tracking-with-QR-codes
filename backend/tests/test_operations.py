from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from io import BytesIO
import pytest
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

from app import db_tools
from app.database import Base
from app.main import app
from app.models import Device, DeviceProfile, InventoryCheck, LoginSession, User
from app.schema import current_revision, head_revision, require_current
from app.security import require_user


def test_migration_adopts_legacy_and_preserves_data(tmp_path, monkeypatch):
    local = create_engine("sqlite:///" + str(tmp_path / "legacy.db"))
    monkeypatch.setattr(db_tools, "BACKUPS", tmp_path / "backups")
    Base.metadata.create_all(local)
    with Session(local) as db:
        user = User(username="legacy-user", password_hash="opaque-existing-hash", role="admin", active=True)
        device = Device(inventory_number="LEGACY-1", name="Legacy monitor")
        db.add_all([user, device])
        db.flush()
        db.add_all([
            LoginSession(token_hash="old-hash", user_id=user.id, csrf_token="old-csrf", expires_at=2000000000),
            InventoryCheck(location="Room", expected=1, found=1,
                           rows=[{"type": "ok", "title": "LEGACY-1", "text": "Found"}]),
        ])
        db.commit()
    with pytest.raises(RuntimeError):
        require_current(local)
    db_tools.upgrade(local)
    assert current_revision(local) == head_revision()
    copy = next((tmp_path / "backups").glob("*.db"))
    assert db_tools.verify_file(copy)["revision"] == "этап 6, без миграций"
    with Session(local) as db:
        assert db.scalar(select(Device.inventory_number)) == "LEGACY-1"
        assert db.scalar(select(User.password_hash)) == "opaque-existing-hash"
        assert db.scalar(select(InventoryCheck.rows))[0]["title"] == "LEGACY-1"
    db_tools.upgrade(local)
    assert len(list((tmp_path / "backups").glob("*.db"))) == 1
    restored = db_tools.restore_copy(copy, tmp_path / "restored.db")
    assert db_tools.verify_file(restored)["devices"] == 1
    with create_engine("sqlite:///" + str(restored)).connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM login_sessions")).scalar() == 0
        assert connection.execute(text("SELECT password_hash FROM users")).scalar() == "opaque-existing-hash"
    with pytest.raises(FileExistsError):
        db_tools.restore_copy(copy, restored)
    local.dispose()


def test_migration_refuses_unknown_schema_and_corrupt_backup(tmp_path, monkeypatch):
    local = create_engine("sqlite:///" + str(tmp_path / "unknown.db"))
    monkeypatch.setattr(db_tools, "BACKUPS", tmp_path / "backups")
    with local.begin() as connection:
        connection.execute(text("CREATE TABLE other (value TEXT)"))
        connection.execute(text("INSERT INTO other VALUES ('keep')"))
    with pytest.raises(RuntimeError):
        db_tools.upgrade(local)
    with local.connect() as connection:
        assert connection.execute(text("SELECT value FROM other")).scalar() == "keep"
    broken = tmp_path / "broken.db"
    broken.write_bytes(b"not sqlite")
    with pytest.raises(Exception):
        db_tools.verify_file(broken)
    assert not (tmp_path / "backups").exists()
    local.dispose()


def test_new_database_migration(tmp_path):
    local = create_engine("sqlite:///" + str(tmp_path / "new.db"))
    db_tools.upgrade(local)
    require_current(local)
    assert set(Base.metadata.tables).issubset(inspect(local).get_table_names())
    local.dispose()


def test_backup_includes_committed_wal_and_never_overwrites(tmp_path):
    local = create_engine("sqlite:///" + str(tmp_path / "wal.db"))
    Base.metadata.create_all(local)
    with local.connect() as kept_open:
        kept_open.execute(text("PRAGMA journal_mode=WAL"))
        kept_open.commit()
        with Session(local) as db:
            db.add(Device(inventory_number="WAL-1", name="Committed monitor"))
            db.commit()
        destination = db_tools.backup(local, tmp_path / "wal-copy.db")
        assert db_tools.verify_file(destination)["devices"] == 1
        original = destination.read_bytes()
        with pytest.raises(FileExistsError):
            db_tools.backup(local, destination)
        assert destination.read_bytes() == original
    local.dispose()


@pytest.fixture
def report_client(clean_database):
    app.dependency_overrides[require_user] = lambda: User(id=-1, username="report", role="employee", active=True)
    with TestClient(app) as client:
        from app.database import SessionLocal
        with SessionLocal.begin() as db:
            db.add_all([
                Device(inventory_number="JAN", name="New threshold", purchase_price=Decimal("1000"),
                       purchase_date=date(2025, 4, 1), profile=DeviceProfile(useful_life_months=10)),
                Device(inventory_number="OLD", name="Overdue", purchase_price=Decimal("2000"),
                       purchase_date=date(2020, 1, 1)),
                Device(inventory_number="MISSING", name="Lost", status="LOST"),
                Device(inventory_number="RETIRED", name="Written off", status="WRITTEN_OFF",
                       purchase_price=Decimal("1000"), purchase_date=date(2020, 1, 1)),
                Device(inventory_number="NO-DATE", name="No date", purchase_price=Decimal("1000")),
                Device(inventory_number="FUTURE", name="Future", purchase_price=Decimal("1000"),
                       purchase_date=date(2030, 1, 1)),
                Device(inventory_number="=BAD()", name="=HYPERLINK(1)", purchase_price=Decimal("1000"),
                       purchase_date=date(2020, 1, 1)),
            ])
        yield client


def test_writeoff_month_quarter_year_and_new_scope(report_client):
    url = "/api/v1/reports/writeoff"
    all_rows = report_client.get(url, params={"year": 2026, "unit": "month", "number": 1}).json()
    assert all_rows["start"] == "2026-01-01" and all_rows["end"] == "2026-01-31"
    numbers = {row["inventory_number"] for row in all_rows["rows"]}
    assert numbers == {"JAN", "OLD", "MISSING", "=BAD()"}
    assert all_rows["count"] == 4
    new = report_client.get(url, params={"year": 2026, "unit": "month", "number": 1, "scope": "new"}).json()
    assert [row["inventory_number"] for row in new["rows"]] == ["JAN"]
    assert float(new["rows"][0]["residual"]) == 100
    quarter = report_client.get(url, params={"year": 2026, "unit": "quarter", "number": 1, "scope": "new"}).json()
    assert quarter["end"] == "2026-03-31" and quarter["rows"][0]["inventory_number"] == "JAN"
    year = report_client.get(url, params={"year": 2026, "unit": "year", "scope": "new"}).json()
    assert year["end"] == "2026-12-31"
    assert report_client.get(url, params={"year": 2026, "unit": "quarter", "number": 5}).status_code == 422
    assert report_client.get(url, params={"year": 2026, "unit": "month", "number": 13}).status_code == 422


def test_report_xlsx_has_parameters_and_no_formulas(report_client):
    response = report_client.get("/api/v1/reports/writeoff",
                                 params={"year": 2026, "unit": "year", "format": "xlsx"})
    assert response.status_code == 200
    book = load_workbook(BytesIO(response.content))
    assert book.sheetnames == ["Кандидаты на списание", "Параметры"]
    assert book.worksheets[0].max_row == 5
    assert all(cell.data_type != "f" for row in book.worksheets[0] for cell in row)
    assert book.worksheets[1]["B2"].value.date() == date(2026, 12, 31)


def test_report_empty_period_and_leap_february(report_client):
    from app.routers.reports import period_dates
    assert period_dates(2028, "month", 2)[1] == date(2028, 2, 29)
    response = report_client.get("/api/v1/reports/writeoff",
                                 params={"year": 2026, "unit": "month", "number": 2, "scope": "new", "format": "xlsx"})
    book = load_workbook(BytesIO(response.content))
    assert book.worksheets[0].max_row == 1
    assert book.worksheets[1]["B6"].value == 0
