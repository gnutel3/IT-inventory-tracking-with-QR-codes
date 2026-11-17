from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class DeviceStatus(str, Enum):
    IN_USE = "IN_USE"
    IN_STORAGE = "IN_STORAGE"
    IN_REPAIR = "IN_REPAIR"
    LOST = "LOST"
    WRITTEN_OFF = "WRITTEN_OFF"


class NamedItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class NamedItemRead(NamedItemCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class DeviceBase(BaseModel):
    inventory_number: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    manufacturer: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    serial_number: str | None = Field(None, max_length=120)
    purchase_date: date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    status: DeviceStatus = DeviceStatus.IN_USE
    description: str | None = None
    category_id: int | None = None
    location_id: int | None = None
    owner: str | None = Field(None, max_length=120)
    useful_life_months: int = Field(36, ge=1)


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    inventory_number: str | None = Field(None, min_length=1, max_length=64)
    name: str | None = Field(None, min_length=1, max_length=200)
    manufacturer: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    serial_number: str | None = Field(None, max_length=120)
    purchase_date: date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    status: DeviceStatus | None = None
    description: str | None = None
    category_id: int | None = None
    location_id: int | None = None
    owner: str | None = Field(None, max_length=120)
    useful_life_months: int | None = Field(None, ge=1)


class DeviceRead(DeviceBase):
    id: int
    qr_token: str | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class DepreciationRules(BaseModel):
    term_mode: Literal["device", "fixed"] = "device"
    fixed_months: int = Field(36, ge=1, le=1200)
    residual_floor_percent: int = Field(0, ge=0, le=99)
    writeoff_threshold_percent: int = Field(90, ge=1, le=100)
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class MovementRead(BaseModel):
    id: int
    device_id: int
    from_location: str | None
    to_location: str | None
    moved_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RepairCreate(BaseModel):
    issue: str = Field(min_length=1, max_length=500)
    contractor: str = Field(default="", max_length=120)
    cost: Decimal = Field(default=0, ge=0, max_digits=12, decimal_places=2)
    model_config = ConfigDict(str_strip_whitespace=True)


class RepairRead(RepairCreate):
    id: int
    started_at: datetime
    finished_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


InventoryText = Annotated[str, Field(min_length=1, max_length=200)]


class InventoryCheckCreate(BaseModel):
    location: str = Field(min_length=1, max_length=100)
    codes: list[InventoryText] = Field(default_factory=list, max_length=5000)
    unknown: list[InventoryText] = Field(default_factory=list, max_length=5000)
    model_config = ConfigDict(str_strip_whitespace=True)


class InventoryRow(BaseModel):
    type: Literal["ok", "bad", "warn"]
    title: str
    text: str


class InventoryCheckSummary(BaseModel):
    id: int
    location: str
    created_at: datetime
    expected: int
    found: int
    model_config = ConfigDict(from_attributes=True)


class InventoryCheckRead(InventoryCheckSummary):
    rows: list[InventoryRow]
