from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DepreciationSettings
from app.schemas import DepreciationRules

router = APIRouter(prefix="/api/v1/depreciation", tags=["Амортизация"])


@router.get("/rules", response_model=DepreciationRules)
def get_rules(db: Session = Depends(get_db)):
    settings = db.get(DepreciationSettings, 1)
    return DepreciationRules.model_validate(settings) if settings else DepreciationRules()


@router.put("/rules", response_model=DepreciationRules)
def save_rules(payload: DepreciationRules, db: Session = Depends(get_db)):
    settings = db.get(DepreciationSettings, 1, with_for_update=True)
    if settings is None:
        settings = DepreciationSettings(id=1, **payload.model_dump())
        db.add(settings)
    else:
        for name, value in payload.model_dump().items():
            setattr(settings, name, value)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Настройки изменились. Обновите страницу и повторите.") from error
    return payload
