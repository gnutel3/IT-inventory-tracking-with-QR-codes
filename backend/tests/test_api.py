import os
import tempfile

# Отдельная временная БД для теста — не портим рабочую базу.
tempdir = tempfile.mkdtemp(prefix="inventory-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{tempdir}/test.db"
from fastapi.testclient import TestClient
from app.main import app

def test_device_crud():
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        cat = client.post("/api/v1/categories", json={"name": "Монитор"})
        loc = client.post("/api/v1/locations", json={"name": "312"})
        assert cat.status_code == 201
        assert loc.status_code == 201
        created = client.post("/api/v1/devices", json={
            "inventory_number": "INV-001", "name": "Dell P2422H",
            "category_id": cat.json()["id"], "location_id": loc.json()["id"]
        })
        assert created.status_code == 201, created.text
        device_id = created.json()["id"]
        assert client.get(f"/api/v1/devices/{device_id}").status_code == 200
        assert len(client.get("/api/v1/devices").json()) == 1
        changed = client.put(f"/api/v1/devices/{device_id}", json={"status": "IN_REPAIR"})
        assert changed.json()["status"] == "IN_REPAIR"
        assert client.delete(f"/api/v1/devices/{device_id}").status_code == 204
        assert client.get(f"/api/v1/devices/{device_id}").status_code == 404


def test_shared_registry():
    with TestClient(app) as first, TestClient(app) as second:
        response = first.post("/api/v1/devices", json={
            "inventory_number": "SHARED-001",
            "name": "Monitor",
            "owner": "IT",
            "useful_life_months": 48,
            "purchase_price": "1200.50",
        })
        assert response.status_code == 201, response.text
        device_id = response.json()["id"]
        url = f"/api/v1/devices/{device_id}"
        assert second.get(url).json()["owner"] == "IT"
        assert second.get(url).json()["useful_life_months"] == 48
        assert second.post("/api/v1/devices", json={
            "inventory_number": "SHARED-001", "name": "Duplicate",
        }).status_code == 409
        assert second.put(url, json={"useful_life_months": None}).status_code == 422
        assert second.put(url, json={"owner": None, "useful_life_months": 60}).status_code == 200
        assert first.get(url).json()["owner"] is None
        assert first.get(url).json()["useful_life_months"] == 60


def test_app_serves_only_frontend_files():
    with TestClient(app) as client:
        response = client.get("/")
        assert response.url.path == "/app/"
        assert response.url.params["mode"] == "server"
        assert "./js/inventory-api.js" in response.text
        assert client.get("/app/js/inventory-api.js").status_code == 200
        assert client.get("/app/js/qr-scanner.js").status_code == 200
        assert client.get("/app/vendor/jsQR.js").status_code == 200
        assert client.get("/app/.env").status_code != 200


def test_history_and_inventory_snapshot():
    with TestClient(app) as client, TestClient(app) as other:
        room = client.post("/api/v1/locations", json={"name": "Office A"}).json()["id"]
        destination = client.post("/api/v1/locations", json={"name": "Office B"}).json()["id"]

        def add(number, location, status="IN_USE"):
            response = client.post("/api/v1/devices", json={
                "inventory_number": number, "name": "Monitor", "location_id": location, "status": status,
            })
            assert response.status_code == 201, response.text
            return response.json()["id"]

        device = add("STAGE-3-FOUND", room)
        add("STAGE-3-MISSING", room)
        foreign = add("STAGE-3-FOREIGN", destination)
        retired = add("STAGE-3-RETIRED", room, "WRITTEN_OFF")
        url = f"/api/v1/devices/{device}"
        check = client.post("/api/v1/inventory-checks", json={
            "location": "Office A",
            "codes": [f"device:{device}", "STAGE-3-FOUND", f"device:{foreign}",
                      f"device:{retired}", "unknown-code", "unknown-code"],
            "unknown": ["USB-C adapter"],
        })
        assert check.status_code == 201, check.text
        snapshot = check.json()
        assert (snapshot["expected"], snapshot["found"]) == (2, 1)
        assert [row["type"] for row in snapshot["rows"]] == ["ok", "bad", "warn", "warn", "warn", "warn"]
        assert snapshot["rows"][-1]["title"] == "USB-C adapter"

        assert client.put(url, json={"location_id": 999999}).status_code == 422
        assert client.put(url, json={"location_id": destination}).status_code == 200
        assert client.put(url, json={"location_id": destination}).status_code == 200
        moves = other.get(f"/api/v1/movements?device_id={device}").json()
        assert [(row["from_location"], row["to_location"]) for row in moves] == [("Office A", "Office B")]
        assert other.get(f'/api/v1/inventory-checks/{snapshot["id"]}').json() == snapshot
        assert other.get("/api/v1/inventory-checks").json()[0]["id"] == snapshot["id"]

        assert client.post(f"{url}/repairs", json={"issue": " "}).status_code == 422
        repair = client.post(f"{url}/repairs", json={"issue": "No image", "cost": "120.50"})
        assert repair.status_code == 201, repair.text
        assert other.get(f"{url}/repairs").json()[0]["finished_at"] is None
        repair_id = repair.json()["id"]
        assert other.put(f"/api/v1/devices/{foreign}/repairs/{repair_id}/close").status_code == 404
        closed = other.put(f"{url}/repairs/{repair_id}/close")
        assert closed.status_code == 200
        assert closed.json()["finished_at"]
        assert other.put(f"{url}/repairs/{repair_id}/close").json() == closed.json()
        assert client.get(f"{url}/repairs").json()[0]["finished_at"] == closed.json()["finished_at"]
        assert client.delete(url).status_code == 409


def test_qr_tags_survive_upgrade_and_renumbering():
    from app.database import SessionLocal
    from app.models import Device

    with TestClient(app):
        with SessionLocal.begin() as db:
            legacy = Device(inventory_number="QR-LEGACY", name="Legacy device")
            db.add(legacy)
            db.flush()
            device_id = legacy.id

    with TestClient(app) as client:
        url = f"/api/v1/devices/{device_id}"
        original = client.get(url).json()
        token = original["qr_token"]
        assert len(token) == 32
        location = client.post("/api/v1/locations", json={"name": "QR room"}).json()["id"]
        moved = client.put(url, json={"inventory_number": "QR-RENAMED", "location_id": location})
        assert moved.status_code == 200
        assert moved.json()["qr_token"] == token
        check = client.post("/api/v1/inventory-checks", json={
            "location": "QR room", "codes": [f"qr:{token}", "QR-RENAMED"],
        })
        assert check.status_code == 201, check.text
        assert (check.json()["expected"], check.json()["found"]) == (1, 1)
        assert len(check.json()["rows"]) == 1
        assert client.get(f"/app/?mode=server&device={token}").status_code == 200

        created = client.post("/api/v1/devices", json={"inventory_number": "QR-DELETE", "name": "Old"})
        old = created.json()
        assert client.delete(f"/api/v1/devices/{old['id']}").status_code == 204
        replacement = client.post("/api/v1/devices", json={"inventory_number": "QR-DELETE", "name": "Replacement"})
        assert replacement.json()["qr_token"] != old["qr_token"]
