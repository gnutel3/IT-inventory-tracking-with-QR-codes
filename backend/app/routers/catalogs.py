from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Location
from app.schemas import NamedItemCreate, NamedItemRead

router = APIRouter(prefix="/api/v1", tags=["Справочники"])


@router.get("/categories", response_model=list[NamedItemRead])
def categories(db: Session = Depends(get_db)):
    return db.scalars(select(Category).order_by(Category.name)).all()


@router.post("/categories", response_model=NamedItemRead, status_code=201)
def create_category(payload: NamedItemCreate, db: Session = Depends(get_db)):
    return create_named(db, Category, payload.name)


@router.get("/locations", response_model=list[NamedItemRead])
def locations(db: Session = Depends(get_db)):
    return db.scalars(select(Location).order_by(Location.name)).all()


@router.post("/locations", response_model=NamedItemRead, status_code=201)
def create_location(payload: NamedItemCreate, db: Session = Depends(get_db)):
    return create_named(db, Location, payload.name)


def create_named(db: Session, model, name: str):
    item = model(name=name)
    db.add(item)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Такое название уже существует")
    return item
