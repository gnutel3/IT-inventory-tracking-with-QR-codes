from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app import models  # noqa: F401 — регистрирует SQLAlchemy-модели
from app.routers import catalogs, devices


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Только для первого учебного этапа. На следующем этапе — Alembic.
    Base.metadata.create_all(bind=engine)
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


@app.get("/health", tags=["Проверка"])
def health():
    return {"status": "ok", "service": "it-inventory-backend"}
