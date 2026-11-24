from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Device
from app.routers.depreciation import get_rules

router = APIRouter(prefix="/api/v1/reports", tags=["Отчёты"])
MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
NOTE = "Расчёт на конец периода по текущему реестру и текущим правилам. Это не исторический бухгалтерский отчёт."


def period_dates(year, unit, number):
    if unit == "quarter" and number > 4:
        raise HTTPException(422, "Квартал должен быть от 1 до 4.")
    first_month = number if unit == "month" else (number - 1) * 3 + 1 if unit == "quarter" else 1
    last_month = first_month if unit == "month" else first_month + 2 if unit == "quarter" else 12
    return date(year, first_month, 1), date(year, last_month, monthrange(year, last_month)[1])


def depreciation(device, rules, day):
    cost = device.purchase_price or Decimal(0)
    if not cost or device.purchase_date is None:
        return cost, Decimal(0)
    months = max(0, (day.year - device.purchase_date.year) * 12 + day.month - device.purchase_date.month)
    life = rules.fixed_months if rules.term_mode == "fixed" else device.useful_life_months
    percent = min(Decimal(100 - rules.residual_floor_percent), Decimal(100) * months / life)
    residual = (cost * (1 - percent / 100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return residual, percent


@router.get("/writeoff")
def writeoff(
    year: int = Query(ge=2000, le=2100),
    unit: Literal["month", "quarter", "year"] = "month",
    number: int = Query(1, ge=1, le=12),
    scope: Literal["all", "new"] = "all",
    format: Literal["json", "xlsx"] = "json",
    db: Session = Depends(get_db),
):
    start, end = period_dates(year, unit, number)
    rules = get_rules(db)
    devices = db.scalars(select(Device).options(
        joinedload(Device.location), joinedload(Device.category), joinedload(Device.profile),
    ).order_by(Device.inventory_number)).all()
    rows = []
    for device in devices:
        if device.status == "WRITTEN_OFF" or (device.purchase_date and device.purchase_date > end):
            continue
        residual, percent = depreciation(device, rules, end)
        _, before = depreciation(device, rules, start - timedelta(days=1))
        reached = percent >= rules.writeoff_threshold_percent
        newly_reached = reached and before < rules.writeoff_threshold_percent
        lost = device.status == "LOST"
        if scope == "new":
            if not newly_reached:
                continue
            reason = "Порог впервые достигнут в выбранном периоде"
        elif lost:
            reason = "Сейчас отмечено как потерянное; дата потери не учтена"
        elif reached:
            reason = "Порог достигнут в периоде" if newly_reached else "Порог достигнут до начала периода"
        else:
            continue
        rows.append({
            "inventory_number": device.inventory_number, "name": device.name,
            "category": device.category.name if device.category else "",
            "location": device.location.name if device.location else "", "owner": device.owner or "",
            "purchase_date": device.purchase_date, "cost": device.purchase_price or Decimal(0),
            "residual": residual, "percent": percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            "status": device.status, "reason": reason,
        })
    result = {"start": start, "end": end, "scope": scope, "note": NOTE,
              "rules": rules.model_dump(), "rows": rows, "count": len(rows),
              "total_cost": sum((row["cost"] for row in rows), Decimal(0)),
              "total_residual": sum((row["residual"] for row in rows), Decimal(0))}
    if format == "json":
        return result
    return workbook_response(result)


def workbook_response(report):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Кандидаты на списание"
    keys = ["inventory_number", "name", "category", "location", "owner", "purchase_date",
            "cost", "residual", "percent", "status", "reason"]
    sheet.append(["Инвентарный номер", "Название", "Категория", "Локация", "Ответственный", "Дата покупки",
                  "Стоимость", "Остаток", "Амортизация, %", "Текущий статус", "Причина"])
    labels = {"IN_USE": "В эксплуатации", "IN_STORAGE": "На складе", "IN_REPAIR": "В ремонте",
              "LOST": "Потеряно", "WRITTEN_OFF": "Списано"}
    for row in report["rows"]:
        sheet.append([labels.get(row[key], row[key]) if key == "status" else row[key] for key in keys])
    for row in sheet.iter_rows():
        for cell in row:
            if isinstance(cell.value, str):
                cell.data_type = "s"
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="22634D")
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = 24
    sheet.column_dimensions["K"].width = 62
    for row in sheet.iter_rows(min_row=2):
        row[5].number_format = "yyyy-mm-dd"
        for cell in row[6:9]:
            cell.number_format = "0.00"
    parameters = workbook.create_sheet("Параметры")
    for row in [
        ["Начало периода", report["start"]], ["Конец периода", report["end"]],
        ["Режим", "Все кандидаты на конец периода" if report["scope"] == "all" else "Порог впервые достигнут в периоде"],
        ["Примечание", report["note"]], ["Дата выгрузки", date.today()],
        ["Количество", report["count"]], ["Суммарная стоимость", report["total_cost"]],
        ["Суммарный остаток", report["total_residual"]],
        ["Срок из карточки", report["rules"]["term_mode"] == "device"],
        ["Общий срок, мес.", report["rules"]["fixed_months"]],
        ["Минимальный остаток, %", report["rules"]["residual_floor_percent"]],
        ["Порог амортизации, %", report["rules"]["writeoff_threshold_percent"]],
    ]:
        parameters.append(row)
    parameters.column_dimensions["A"].width = 30
    parameters.column_dimensions["B"].width = 100
    parameters["B1"].number_format = parameters["B2"].number_format = parameters["B5"].number_format = "yyyy-mm-dd"
    output = BytesIO()
    workbook.save(output)
    name = f"writeoff-{report['start']}-{report['end']}.xlsx"
    return Response(output.getvalue(), media_type=MIME,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
