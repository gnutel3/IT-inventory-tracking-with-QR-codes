import argparse
from getpass import getpass

from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.database import Base, SessionLocal, engine
from app.models import LoginSession, User
from app.routers.auth import UserCreate
from app.security import passwords


def main():
    parser = argparse.ArgumentParser(description="Локальное управление учётными записями")
    parser.add_argument("action", choices=["create", "reset-password"])
    parser.add_argument("--username", required=True)
    parser.add_argument("--role", choices=["admin", "employee"], default="admin")
    args = parser.parse_args()
    password = getpass("Пароль (не менее 12 символов; ввод скрыт): ")
    if password != getpass("Повторите пароль: "):
        parser.exit(1, "Пароли не совпадают. Изменений нет.\n")
    try:
        payload = UserCreate(username=args.username, password=password, role=args.role)
    except ValidationError:
        parser.exit(1, "Логин: 3–64 символа a-z, 0-9, _, -, точка. Пароль: 12–128 символов.\n")
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == payload.username))
        if args.action == "create":
            if user:
                parser.exit(1, "Логин уже занят. Используйте reset-password для сброса.\n")
            db.add(User(username=payload.username, role=payload.role, active=True,
                        password_hash=passwords.hash(payload.password)))
        else:
            if not user:
                parser.exit(1, "Пользователь не найден.\n")
            user.password_hash = passwords.hash(payload.password)
            db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            parser.exit(1, "Учётная запись уже создана другим процессом.\n")
    print("Готово. Пароль сохранён в виде хеша.")


if __name__ == "__main__":
    main()
