from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Device, InventoryCheck, Location, Movement, Repair
from app.schemas import (
    InventoryCheckCreate, InventoryCheckRead, InventoryCheckSummary,
    MovementRead, RepairCreate, RepairRead,
)

router = APIRouter(prefix="/api/v1", tags=["История и инвентаризация"])


@router.get("/movements", response_model=list[MovementRead])
def movements(device_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(Movement).order_by(Movement.id.desc())
    if device_id is not None:
        stmt = stmt.where(Movement.device_id == device_id)
    return db.scalars(stmt.limit(100)).all()


@router.get("/devices/{device_id}/repairs", response_model=list[RepairRead])
def repairs(device_id: int, db: Session = Depends(get_db)):
    if db.get(Device, device_id) is None:
        raise HTTPException(404, "Устройство не найдено")
    return db.scalars(select(Repair).where(Repair.device_id == device_id).order_by(Repair.id.desc())).all()


@router.post("/devices/{device_id}/repairs", response_model=RepairRead, status_code=201)
def add_repair(device_id: int, payload: RepairCreate, db: Session = Depends(get_db)):
    if db.get(Device, device_id, with_for_update=True) is None:
        raise HTTPException(404, "Устройство не найдено")
    repair = Repair(device_id=device_id, **payload.model_dump())
    db.add(repair)
    db.commit()
    return repair


@router.put("/devices/{device_id}/repairs/{repair_id}/close", response_model=RepairRead)
def close_repair(device_id: int, repair_id: int, db: Session = Depends(get_db)):
    repair = db.get(Repair, repair_id, with_for_update=True)
    if repair is None or repair.device_id != device_id:
        raise HTTPException(404, "Ремонт не найден")
    if repair.finished_at is None:
        repair.finished_at = datetime.now(timezone.utc)
        db.commit()
    return repair


@router.get("/inventory-checks", response_model=list[InventoryCheckSummary])
def checks(db: Session = Depends(get_db)):
    return db.scalars(select(InventoryCheck).order_by(InventoryCheck.id.desc()).limit(50)).all()


@router.get("/inventory-checks/{check_id}", response_model=InventoryCheckRead)
def check_details(check_id: int, db: Session = Depends(get_db)):
    check = db.get(InventoryCheck, check_id)
    if check is None:
        raise HTTPException(404, "Проверка не найдена")
    return check


@router.post("/inventory-checks", response_model=InventoryCheckRead, status_code=201)
def save_check(payload: InventoryCheckCreate, db: Session = Depends(get_db)):
    location = db.scalar(select(Location).where(Location.name == payload.location))
    if location is None:
        raise HTTPException(422, "Локация не найдена")
    devices = db.scalars(select(Device).options(joinedload(Device.location), joinedload(Device.qr_tag)).order_by(Device.id)).all()
    by_id = {str(device.id): device for device in devices}
    by_number = {device.inventory_number: device for device in devices}
    by_token = {device.qr_token: device for device in devices if device.qr_token}
    by_lower = {}
    for device in devices:
        key = device.inventory_number.lower()
        by_lower[key] = device if key not in by_lower else None
    expected = {device.id: device for device in devices
                if device.location_id == location.id and device.status != "WRITTEN_OFF"}
    scanned, missing_codes = set(), set()
    extra = []
    for code in payload.codes:
        if match := re.fullmatch(r"qr:([0-9a-f]{32})", code):
            device = by_token.get(match[1])
        elif match := re.fullmatch(r"device:(\d+)", code):
            device = by_id.get(match[1])
        else:
            number = code.split("|", 1)[1] if re.match(r"asset:\d+\|", code) else code
            device = by_number.get(number) or by_lower.get(number.lower())
        if device is None:
            if code.lower() not in missing_codes:
                extra.append(dict(type="warn", title=code, text="Код не найден в реестре"))
                missing_codes.add(code.lower())
        elif device.id not in scanned:
            scanned.add(device.id)
            if device.id not in expected:
                reason = "Списанное устройство" if device.status == "WRITTEN_OFF" else (
                    f"По базе: {device.location.name}" if device.location else "В базе нет локации")
                extra.append(dict(type="warn", title=device.inventory_number, text=f"{device.name}. {reason}"))
    rows = [dict(type="ok" if key in scanned else "bad", title=device.inventory_number,
                 text=f"{device.name}: {'найдено' if key in scanned else 'не найдено'}")
            for key, device in expected.items()]
    rows.extend(extra)
    rows.extend(dict(type="warn", title=name, text="Найдено без QR-метки") for name in payload.unknown)
    check = InventoryCheck(location=location.name, expected=len(expected),
                           found=len(scanned.intersection(expected)), rows=rows)
    db.add(check)
    db.commit()
    return check
