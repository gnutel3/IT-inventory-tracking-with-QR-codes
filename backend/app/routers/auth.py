import secrets
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LoginSession, LoginThrottle, User
from app.security import (
    COOKIE, DUMMY_HASH, SESSION_SECONDS, check_origin, digest, passwords,
    require_admin, require_user, secure_cookie,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Вход и пользователи"])


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class UserCreate(Credentials):
    password: str = Field(min_length=12, max_length=128)
    role: Literal["admin", "employee"] = "employee"


class UserRead(BaseModel):
    id: int
    username: str
    role: Literal["admin", "employee"]
    active: bool
    model_config = ConfigDict(from_attributes=True)


class ActiveUpdate(BaseModel):
    active: bool


def session_view(user, session):
    return {"user": UserRead.model_validate(user), "csrf_token": session.csrf_token}


@router.post("/login")
def login(payload: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request)
    now = int(time.time())
    # A persistent IP bucket limits repeated password verification, also across restarts.
    key = digest(request.client.host if request.client else "unknown")
    bucket = db.get(LoginThrottle, key)
    if bucket is None:
        bucket = LoginThrottle(key=key, attempts=0, reset_at=now + 300)
        db.add(bucket)
    try:
        db.flush()
        db.execute(update(LoginThrottle).where(LoginThrottle.key == key, LoginThrottle.reset_at <= now)
                   .values(attempts=0, reset_at=now + 300))
        attempt = db.execute(update(LoginThrottle).where(
            LoginThrottle.key == key, LoginThrottle.attempts < 10, LoginThrottle.reset_at > now,
        ).values(attempts=LoginThrottle.attempts + 1))
        if not attempt.rowcount:
            db.rollback()
            raise HTTPException(429, "Слишком много попыток. Повторите через 5 минут.", headers={"Retry-After": "300"})
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(429, "Повторите вход через несколько секунд.") from error
    user = db.scalar(select(User).where(User.username == payload.username))
    valid = passwords.verify(payload.password, user.password_hash if user else DUMMY_HASH)
    if not valid or user is None or not user.active:
        raise HTTPException(401, "Неверный логин или пароль.")
    if old := request.cookies.get(COOKIE):
        db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(old)))
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))
    db.execute(delete(LoginThrottle).where(LoginThrottle.reset_at <= now))
    db.execute(update(LoginThrottle).where(LoginThrottle.key == key).values(attempts=0))
    raw = secrets.token_urlsafe(32)
    session = LoginSession(token_hash=digest(raw), user_id=user.id, csrf_token=secrets.token_urlsafe(32),
                           expires_at=now + SESSION_SECONDS)
    db.add(session)
    db.commit()
    response.set_cookie(COOKIE, raw, max_age=SESSION_SECONDS, httponly=True,
                        secure=secure_cookie(), samesite="strict", path="/api")
    return session_view(user, session)


@router.get("/me")
def me(request: Request, user: User = Depends(require_user)):
    return session_view(user, request.state.login_session)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: User = Depends(require_user), db: Session = Depends(get_db)):
    db.delete(request.state.login_session)
    db.commit()
    response.delete_cookie(COOKIE, path="/api", secure=secure_cookie(), httponly=True, samesite="strict")


@router.get("/users", response_model=list[UserRead])
def users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.id)).all()


@router.post("/users", response_model=UserRead, status_code=201)
def create_user(payload: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = User(username=payload.username, password_hash=passwords.hash(payload.password),
                role=payload.role, active=True)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Такой логин уже используется.") from error
    return user


@router.put("/users/{user_id}/active", response_model=UserRead)
def change_active(user_id: int, payload: ActiveUpdate, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден.")
    if user.role == "admin":
        raise HTTPException(403, "В этой версии блокировать можно только сотрудников.")
    user.active = payload.active
    if not user.active:
        db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.commit()
    return user
