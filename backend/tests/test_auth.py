import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models import LoginSession, User
from app.security import COOKIE, digest, passwords

PASSWORD = "test-only-password-2026"
LOGIN_HEADERS = {"X-Inventory-Request": "1"}


@pytest.fixture
def accounts():
    with SessionLocal.begin() as db:
        hashed = passwords.hash(PASSWORD)
        db.add_all([User(username="admin", password_hash=hashed, role="admin", active=True),
                    User(username="worker", password_hash=hashed, role="employee", active=True)])


def sign_in(client, username="admin"):
    result = client.post("/api/v1/auth/login", headers=LOGIN_HEADERS,
                         json={"username": username, "password": PASSWORD})
    assert result.status_code == 200, result.text
    client.headers.update({**LOGIN_HEADERS, "X-CSRF-Token": result.json()["csrf_token"]})
    return result


def test_anonymous_cannot_access_inventory(accounts):
    with TestClient(app) as client:
        for path in ("devices", "categories", "locations", "movements", "inventory-checks",
                     "depreciation/rules", "import/xlsx/template", "reports/writeoff?year=2026",
                     "auth/users", "auth/me"):
            assert client.get(f"/api/v1/{path}").status_code == 401, path
        assert client.get("/").status_code == 200
        assert client.post("/api/v1/devices", json={"name": "Hidden", "inventory_number": "NO"}).status_code == 401
        assert client.post("/api/v1/import/xlsx/apply", files={"file": ("x.xlsx", b"x")}).status_code == 401


def test_sessions_csrf_rotation_logout_and_expiry(accounts):
    with TestClient(app) as client:
        login = sign_in(client)
        cookie = login.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
        raw = client.cookies.get(COOKIE)
        with SessionLocal() as db:
            row = db.get(LoginSession, digest(raw))
            assert row and row.token_hash != raw
        assert client.get("/api/v1/auth/me").json()["user"]["username"] == "admin"
        assert client.get("/api/v1/devices").headers["cache-control"] == "no-store"
        client.headers.pop("x-csrf-token")
        assert client.post("/api/v1/categories", json={"name": "Forbidden"}).status_code == 403
        client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert client.post("/api/v1/categories", headers={"Origin": "https://foreign.invalid"},
                           json={"name": "Forbidden"}).status_code == 403
        assert client.post("/api/v1/categories", json={"name": "Allowed"}).status_code == 201
        sign_in(client)
        with SessionLocal() as db:
            assert db.get(LoginSession, digest(raw)) is None
        assert client.post("/api/v1/auth/logout").status_code == 204
        assert client.get("/api/v1/auth/me").status_code == 401
        sign_in(client)
        with SessionLocal.begin() as db:
            db.get(LoginSession, digest(client.cookies.get(COOKIE))).expires_at = int(time.time()) - 1
        assert client.get("/api/v1/devices").status_code == 401


def test_employee_cannot_change_registry_but_can_check_and_repair(accounts):
    with TestClient(app) as admin, TestClient(app) as worker:
        sign_in(admin)
        device = admin.post("/api/v1/devices", json={"name": "Monitor", "inventory_number": "ROLE-1"}).json()
        room = admin.post("/api/v1/locations", json={"name": "Role room"}).json()
        admin.put(f'/api/v1/devices/{device["id"]}', json={"location_id": room["id"]})
        sign_in(worker, "worker")
        assert worker.get("/api/v1/devices").status_code == 200
        for path, payload in (
            ("devices", {"name": "No", "inventory_number": "ROLE-NO"}),
            ("categories", {"name": "No"}), ("locations", {"name": "No"}),
            ("auth/users", {"username": "escalation", "password": PASSWORD, "role": "admin"}),
        ):
            assert worker.post(f"/api/v1/{path}", json=payload).status_code == 403, path
        assert worker.get("/api/v1/auth/users").status_code == 403
        assert worker.put("/api/v1/depreciation/rules", json={}).status_code == 403
        assert worker.put(f'/api/v1/devices/{device["id"]}', json={"name": "No"}).status_code == 403
        assert worker.delete(f'/api/v1/devices/{device["id"]}').status_code == 403
        assert worker.post("/api/v1/import/xlsx/apply", files={"file": ("x.xlsx", b"x")}).status_code == 403
        for path in ("preview", "apply"):
            assert worker.post(f"/api/v1/import/xlsx/{path}", files={"file": ("x.xlsx", b"x")}).status_code == 403
        repair = worker.post(f'/api/v1/devices/{device["id"]}/repairs', json={"issue": "No signal"})
        assert repair.status_code == 201
        assert worker.put(f'/api/v1/devices/{device["id"]}/repairs/{repair.json()["id"]}/close').status_code == 200
        check = worker.post("/api/v1/inventory-checks", json={"location": "Role room", "codes": ["ROLE-1"]})
        assert check.status_code == 201 and check.json()["found"] == 1


def test_admin_creates_and_blocks_employee(accounts):
    with TestClient(app) as admin, TestClient(app) as worker:
        sign_in(admin)
        response = admin.post("/api/v1/auth/users", json={"username": " NEW.User ", "password": PASSWORD})
        assert response.status_code == 201
        user = response.json()
        assert user["username"] == "new.user" and "password_hash" not in response.text
        assert admin.post("/api/v1/auth/users", json={"username": "new.user", "password": PASSWORD}).status_code == 409
        invalid = admin.post("/api/v1/auth/users", json={"username": "notvalid", "password": "secret123"})
        assert invalid.status_code == 422 and "secret123" not in invalid.text
        sign_in(worker, "new.user")
        assert admin.put(f'/api/v1/auth/users/{user["id"]}/active', json={"active": False}).status_code == 200
        assert worker.get("/api/v1/devices").status_code == 401
        denied = worker.post("/api/v1/auth/login", headers=LOGIN_HEADERS, json={"username": "new.user", "password": PASSWORD})
        assert denied.status_code == 401
        assert admin.put(f'/api/v1/auth/users/{user["id"]}/active', json={"active": True}).status_code == 200
        sign_in(worker, "new.user")
        my_id = admin.get("/api/v1/auth/me").json()["user"]["id"]
        assert admin.put(f"/api/v1/auth/users/{my_id}/active", json={"active": False}).status_code == 403


def test_login_rate_limit_and_origin(accounts):
    with TestClient(app) as client:
        payload = {"username": "admin", "password": "not-the-password"}
        assert client.post("/api/v1/auth/login", json=payload).status_code == 403
        assert client.post("/api/v1/auth/login", headers={**LOGIN_HEADERS, "Origin": "https://foreign.invalid"}, json=payload).status_code == 403
        for _ in range(10):
            assert client.post("/api/v1/auth/login", headers=LOGIN_HEADERS, json=payload).status_code == 401
        assert client.post("/api/v1/auth/login", headers=LOGIN_HEADERS, json=payload).status_code == 429


def test_https_secure_cookie(accounts, monkeypatch):
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    with TestClient(app, base_url="https://inventory.test") as client:
        assert "Secure" in sign_in(client).headers["set-cookie"]
        assert client.get("/api/v1/auth/me").status_code == 200


def test_cli_create_and_reset_password(monkeypatch):
    from app import manage_users
    monkeypatch.setattr("sys.argv", ["manage_users", "create", "--username", "cli-admin"])
    monkeypatch.setattr(manage_users, "getpass", lambda _: PASSWORD)
    manage_users.main()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == "cli-admin"))
        assert user.role == "admin" and passwords.verify(PASSWORD, user.password_hash)
    with TestClient(app) as client:
        sign_in(client, "cli-admin")
        monkeypatch.setattr("sys.argv", ["manage_users", "reset-password", "--username", "cli-admin"])
        monkeypatch.setattr(manage_users, "getpass", lambda _: PASSWORD + "-changed")
        manage_users.main()
        assert client.get("/api/v1/auth/me").status_code == 401
