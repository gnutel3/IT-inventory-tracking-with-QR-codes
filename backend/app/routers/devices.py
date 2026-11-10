from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Device, Location
from app.schemas import DeviceCreate, DeviceRead, DeviceUpdate

router = APIRouter(prefix="/api/v1/devices", tags=["Устройства"])


def validate_references(db: Session, values: dict):
    if values.get("category_id") is not None and db.get(Category, values["category_id"]) is None:
        raise HTTPException(422, "Категория не найдена")
    if values.get("location_id") is not None and db.get(Location, values["location_id"]) is None:
        raise HTTPException(422, "Помещение не найдено")


def save(db: Session, device: Device):
    try:
        db.commit()
        db.refresh(device)
        return device
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Инвентарный номер уже используется")


@router.get("", response_model=list[DeviceRead])
def list_devices(
    search: str | None = None,
    location_id: int | None = None,
    category_id: int | None = None,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Device).order_by(Device.id)
    if search:
        stmt = stmt.where(Device.name.ilike(f"%{search}%") | Device.inventory_number.ilike(f"%{search}%"))
    if location_id is not None:
        stmt = stmt.where(Device.location_id == location_id)
    if category_id is not None:
        stmt = stmt.where(Device.category_id == category_id)
    if status_filter:
        stmt = stmt.where(Device.status == status_filter)
    return db.scalars(stmt.offset(offset).limit(limit)).all()


@router.get("/{device_id}", response_model=DeviceRead)
def get_device(device_id: int, db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "Устройство не найдено")
    return device


@router.post("", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
def create_device(payload: DeviceCreate, db: Session = Depends(get_db)):
    values = payload.model_dump()
    validate_references(db, values)
    device = Device(**values)
    db.add(device)
    return save(db, device)


@router.put("/{device_id}", response_model=DeviceRead)
def update_device(device_id: int, payload: DeviceUpdate, db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "Устройство не найдено")
    values = payload.model_dump(exclude_unset=True)
    for required in ("inventory_number", "name", "status"):
        if required in values and values[required] is None:
            raise HTTPException(422, f"Поле {required} не может быть null")
    validate_references(db, values)
    for key, value in values.items():
        setattr(device, key, value)
    return save(db, device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: int, db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "Устройство не найдено")
    db.delete(device)
    db.commit()
