from datetime import date, datetime
from decimal import Decimal
from enum import Enum

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


class DeviceRead(DeviceBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
