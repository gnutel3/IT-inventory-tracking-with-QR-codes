import hashlib
import os
import secrets
import time

from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LoginSession, User

COOKIE = "inventory_session"
SESSION_SECONDS = 8 * 60 * 60
passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(24))


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def secure_cookie():
    return os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"


def check_origin(request: Request):
    if request.headers.get("x-inventory-request") != "1":
        raise HTTPException(403, "Нужен запрос из приложения.")
    origin = request.headers.get("origin")
    if origin and origin != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "Источник запроса не разрешён.")


def require_user(request: Request, db: Session = Depends(get_db)):
    raw = request.cookies.get(COOKIE, "")
    session = db.get(LoginSession, digest(raw)) if raw else None
    if session is None or session.expires_at <= int(time.time()):
        raise HTTPException(401, "Войдите в систему.")
    user = db.get(User, session.user_id)
    if user is None or not user.active:
        raise HTTPException(401, "Войдите в систему.")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        check_origin(request)
        if not secrets.compare_digest(request.headers.get("x-csrf-token", "").encode(), session.csrf_token.encode()):
            raise HTTPException(403, "Обновите страницу: проверка CSRF не пройдена.")
    request.state.login_session = session
    return user


def require_admin(user: User = Depends(require_user)):
    if user.role != "admin":
        raise HTTPException(403, "Действие доступно только администратору.")
    return user


def admin_write(request: Request, user: User = Depends(require_user)):
    if request.method not in ("GET", "HEAD", "OPTIONS") and user.role != "admin":
        raise HTTPException(403, "Изменять эти данные может только администратор.")
