from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Device, DeviceQrTag
from app.routers import catalogs, depreciation, devices, excel, history


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Только для первого учебного этапа. На следующем этапе — Alembic.
    Base.metadata.create_all(bind=engine)
    with SessionLocal.begin() as db:
        missing = db.scalars(select(Device.id).where(~Device.qr_tag.has()))
        db.add_all(DeviceQrTag(device_id=device_id) for device_id in missing)
    yield


app = FastAPI(title="IT Inventory API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4173", "http://127.0.0.1:4173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(catalogs.router)
app.include_router(history.router)
app.include_router(excel.router)
app.include_router(depreciation.router)

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


@app.get("/", include_in_schema=False)
def index_redirect():
    return RedirectResponse("/app/?mode=server")


app.mount("/app", StaticFiles(directory=FRONTEND, html=True), name="frontend")


@app.get("/health", tags=["Проверка"])
def health():
    return {"status": "ok", "service": "it-inventory-backend"}
