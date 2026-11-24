from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Device, DeviceQrTag
from app.routers import auth, catalogs, depreciation, devices, excel, history
from app.security import admin_write, require_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Только для первого учебного этапа. На следующем этапе — Alembic.
    Base.metadata.create_all(bind=engine)
    with SessionLocal.begin() as db:
        missing = db.scalars(select(Device.id).where(~Device.qr_tag.has()))
        db.add_all(DeviceQrTag(device_id=device_id) for device_id in missing)
    yield


app = FastAPI(title="IT Inventory API", version="0.1.0", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(devices.router, dependencies=[Depends(admin_write)])
app.include_router(catalogs.router, dependencies=[Depends(admin_write)])
app.include_router(history.router, dependencies=[Depends(require_user)])
app.include_router(excel.router, dependencies=[Depends(admin_write)])
app.include_router(depreciation.router, dependencies=[Depends(admin_write)])


@app.middleware("http")
async def private_api(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    # Do not reflect submitted passwords or form contents in API validation responses.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]} for item in error.errors()
    ]})

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


@app.get("/", include_in_schema=False)
def index_redirect():
    return RedirectResponse("/app/?mode=server")


app.mount("/app", StaticFiles(directory=FRONTEND, html=True), name="frontend")


@app.get("/health", tags=["Проверка"])
def health():
    return {"status": "ok", "service": "it-inventory-backend"}
