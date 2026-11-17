from datetime import date, datetime
from io import BytesIO
from typing import Annotated
from zipfile import BadZipFile, ZipFile

from defusedxml.common import DefusedXmlException
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from xml.etree.ElementTree import ParseError

from app.database import get_db
from app.models import Category, Device, DeviceQrTag, Location
from app.routers.devices import apply_values
from app.schemas import DeviceCreate

router = APIRouter(prefix="/api/v1/import/xlsx", tags=["Импорт Excel"])

MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_FILE = 2 * 1024 * 1024
MAX_UNPACKED = 20 * 1024 * 1024
MAX_ROWS = 500
MAX_COLS = 32
HEADERS = {
    "inventory_number": ("Инвентарный номер", "inventoryNumber"),
    "name": ("Название", "name"),
    "category": ("Категория", "category"),
    "serial_number": ("Серийный номер", "serial"),
    "location": ("Локация", "location"),
    "owner": ("Владелец", "owner"),
    "status": ("Статус", "status"),
    "purchase_price": ("Стоимость", "cost"),
    "purchase_date": ("Дата покупки", "purchaseDate"),
    "useful_life_months": ("Срок службы", "usefulLifeMonths"),
    "description": ("Комментарий", "notes"),
}
REQUIRED = ("inventory_number", "name", "category", "location")
ALIASES = {label.casefold(): field for field, labels in HEADERS.items() for label in (*labels, field)}
STATUSES = {
    "в эксплуатации": "IN_USE", "на складе": "IN_STORAGE", "в ремонте": "IN_REPAIR",
    "потеряно": "LOST", "списано": "WRITTEN_OFF",
}


class ImportDevice(DeviceCreate):
    category: str = Field(min_length=1, max_length=100)
    location: str = Field(min_length=1, max_length=100)
    useful_life_months: int = Field(36, ge=1, le=1200)
    description: str | None = Field(None, max_length=4000)


@router.get("/template")
def template():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Техника"
    sheet.append([labels[0] for labels in HEADERS.values()])
    sheet.append(["DEMO-501", "Тестовый монитор", "Монитор", "SER-501", "Кабинет 304",
                  "IT", "В эксплуатации", 25000, date(2022, 1, 15), 48, "Пример строки"])
    sheet.freeze_panes = "A2"
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = 22
    sheet["A2"].number_format = "@"
    output = BytesIO()
    workbook.save(output)
    return Response(output.getvalue(), media_type=MIME,
                    headers={"Content-Disposition": 'attachment; filename="inventory-template.xlsx"'})


def text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def field_error(item):
    field = item["loc"][0]
    label = HEADERS.get(field, (field,))[0]
    if item["type"] in ("string_too_short", "missing"):
        return f"{label}: обязательное поле"
    if "too_long" in item["type"]:
        return f"{label}: слишком длинное значение"
    examples = {
        "status": "неизвестный статус",
        "purchase_price": "укажите неотрицательную сумму до двух знаков после запятой",
        "purchase_date": "укажите дату в формате ГГГГ-ММ-ДД или ДД.ММ.ГГГГ",
        "useful_life_months": "укажите целое число от 1 до 1200",
    }
    return f"{label}: {examples.get(field, 'недопустимое значение')}"


def validate_row(values):
    payload = {field: text(value) or None for field, value in values.items()}
    for field in REQUIRED:
        payload[field] = payload.get(field) or ""
    status = payload.get("status")
    payload["status"] = STATUSES.get(status.casefold(), status.upper()) if status else "IN_USE"
    raw_date = values.get("purchase_date")
    if isinstance(raw_date, datetime):
        payload["purchase_date"] = raw_date.date()
    elif isinstance(raw_date, date):
        payload["purchase_date"] = raw_date
    elif payload.get("purchase_date"):
        raw = payload["purchase_date"]
        for pattern in ("%Y-%m-%d", "%d.%m.%Y"):
            try:
                payload["purchase_date"] = datetime.strptime(raw, pattern).date()
                break
            except ValueError:
                pass
        else:
            payload["purchase_date"] = "invalid"
    if payload.get("purchase_price"):
        payload["purchase_price"] = "".join(payload["purchase_price"].split()).replace(",", ".")
    payload["useful_life_months"] = payload.get("useful_life_months") or 36
    return ImportDevice.model_validate(payload)


def read_rows(file: UploadFile, db: Session):
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(422, "Выберите файл .xlsx.")
    data = file.file.read(MAX_FILE + 1)
    if len(data) > MAX_FILE:
        raise HTTPException(413, "Файл больше 2 МБ.")
    parsed = []
    try:
        with ZipFile(BytesIO(data)) as archive:
            if len(archive.infolist()) > 120 or sum(member.file_size for member in archive.infolist()) > MAX_UNPACKED:
                raise HTTPException(413, "Слишком большой файл Excel после распаковки.")
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=False, keep_links=False)
        try:
            sheet = workbook.worksheets[0]
            if sheet.max_column and sheet.max_column > MAX_COLS:
                raise HTTPException(422, f"На первом листе допускается не более {MAX_COLS} столбцов.")
            sheet.reset_dimensions()
            rows = sheet.iter_rows(max_col=MAX_COLS)
            header = next(rows, ())
            fields = [ALIASES.get(text(cell.value).casefold()) for cell in header]
            recognized = [field for field in fields if field]
            if len(set(recognized)) != len(recognized):
                raise HTTPException(422, "В строке заголовков есть повторяющиеся столбцы.")
            missing = [HEADERS[field][0] for field in REQUIRED if field not in recognized]
            if missing:
                raise HTTPException(422, "Нет обязательных столбцов: " + ", ".join(missing))
            for number, cells in enumerate(rows, 2):
                if number > MAX_ROWS + 1:
                    raise HTTPException(422, f"Допускается до {MAX_ROWS} строк данных на первом листе.")
                values = {field: cell.value for field, cell in zip(fields, cells) if field}
                if not any(text(value) for value in values.values()):
                    continue
                errors = ["В столбцах данных нельзя использовать формулы или значения с ошибкой"] if any(
                    field and cell.data_type in ("f", "e") for field, cell in zip(fields, cells)
                ) else []
                record = None
                if not errors:
                    try:
                        record = validate_row(values)
                    except ValidationError as error:
                        errors.extend(field_error(item) for item in error.errors())
                parsed.append((number, text(values["inventory_number"]), text(values["name"]), errors, record))
        finally:
            workbook.close()
    except (BadZipFile, InvalidFileException, DefusedXmlException, ParseError, KeyError, IndexError, TypeError,
            ValueError, OverflowError, OSError) as error:
        raise HTTPException(422, "Не удалось прочитать книгу Excel. Сохраните её заново как .xlsx.") from error
    if not parsed:
        raise HTTPException(422, "На первом листе нет строк для импорта.")
    numbers = {number for _, number, _, _, _ in parsed if number and len(number) <= 64}
    existing = set(db.scalars(select(Device.inventory_number).where(Device.inventory_number.in_(numbers))))
    counts = {}
    for _, number, _, _, _ in parsed:
        if number:
            counts[number] = counts.get(number, 0) + 1
    for _, number, _, errors, _ in parsed:
        if number in existing:
            errors.append("Инвентарный номер уже есть в реестре")
        if counts.get(number, 0) > 1:
            errors.append("Инвентарный номер повторяется в файле")
    return parsed


@router.post("/preview")
def preview(file: Annotated[UploadFile, File()], db: Session = Depends(get_db)):
    return {"rows": [
        {"row": line, "inventory_number": number, "name": name, "errors": errors}
        for line, number, name, errors, _ in read_rows(file, db)
    ]}


@router.post("/apply")
def apply(file: Annotated[UploadFile, File()], db: Session = Depends(get_db)):
    rows = read_rows(file, db)
    invalid = [str(line) for line, _, _, errors, _ in rows if errors]
    if invalid:
        raise HTTPException(422, "Импорт отменён. Проверьте строки: " + ", ".join(invalid))

    def get_or_add(model, name, cache):
        if name not in cache:
            item = db.scalar(select(model).where(model.name == name))
            if item is None:
                item = model(name=name)
                db.add(item)
            cache[name] = item
        return cache[name]

    categories, locations = {}, {}
    for _, _, _, _, record in rows:
        device = Device(qr_tag=DeviceQrTag())
        apply_values(device, record.model_dump(exclude={"category", "location"}))
        device.category = get_or_add(Category, record.category, categories)
        device.location = get_or_add(Location, record.location, locations)
        db.add(device)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Реестр изменился. Ни одна строка не добавлена; проверьте файл заново.") from error
    return {"added": len(rows)}
