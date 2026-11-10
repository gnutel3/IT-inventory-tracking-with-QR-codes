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
