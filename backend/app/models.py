from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    devices: Mapped[list["Device"]] = relationship(back_populates="category")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    devices: Mapped[list["Device"]] = relationship(back_populates="location")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    inventory_number: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(120))
    purchase_date: Mapped[date | None] = mapped_column(Date)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="IN_USE")
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"))
    category: Mapped[Category | None] = relationship(back_populates="devices")
    location: Mapped[Location | None] = relationship(back_populates="devices")
    profile: Mapped["DeviceProfile | None"] = relationship(cascade="all, delete-orphan")
    qr_tag: Mapped["DeviceQrTag | None"] = relationship(cascade="all, delete-orphan")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def owner(self):
        return self.profile.owner if self.profile else None

    @property
    def useful_life_months(self):
        return self.profile.useful_life_months if self.profile else 36

    @property
    def qr_token(self):
        return self.qr_tag.token if self.qr_tag else None


class DeviceProfile(Base):
    __tablename__ = "device_profiles"

    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), primary_key=True)
    owner: Mapped[str | None] = mapped_column(String(120))
    useful_life_months: Mapped[int] = mapped_column(default=36)


class DeviceQrTag(Base):
    __tablename__ = "device_qr_tags"

    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), primary_key=True)
    token: Mapped[str] = mapped_column(String(32), unique=True, default=lambda: uuid4().hex)


class DepreciationSettings(Base):
    __tablename__ = "depreciation_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    term_mode: Mapped[str] = mapped_column(String(10))
    fixed_months: Mapped[int]
    residual_floor_percent: Mapped[int]
    writeoff_threshold_percent: Mapped[int]


class Movement(Base):
    __tablename__ = "device_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    from_location: Mapped[str | None] = mapped_column(String(100))
    to_location: Mapped[str | None] = mapped_column(String(100))
    moved_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class Repair(Base):
    __tablename__ = "device_repairs"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    issue: Mapped[str] = mapped_column(String(500))
    contractor: Mapped[str] = mapped_column(String(120))
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    started_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    finished_at: Mapped[datetime | None]


class InventoryCheck(Base):
    __tablename__ = "inventory_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    location: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    expected: Mapped[int]
    found: Mapped[int]
    rows: Mapped[list[dict]] = mapped_column(JSON)
