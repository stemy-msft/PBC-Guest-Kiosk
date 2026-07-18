from sqlalchemy.orm import Session

from .auth import hash_password
from .config import (
    DEFAULT_ADMIN_DISPLAY_NAME,
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_USERNAME,
)
from .models import User


def create_default_admin(db: Session):
    existing_user = (
        db.query(User)
        .filter(
            User.username == DEFAULT_ADMIN_USERNAME
        )
        .first()
    )

    if existing_user:
        return

    admin = User(
        username=DEFAULT_ADMIN_USERNAME,
        display_name=DEFAULT_ADMIN_DISPLAY_NAME,
        email=None,
        role="Administrator",
        enabled=True,
        must_change_password=True,
        password_hash=hash_password(
            DEFAULT_ADMIN_PASSWORD
        ),
    )

    db.add(admin)
    db.commit()

    print(
        f"Created default administrator account: "
        f"{DEFAULT_ADMIN_USERNAME}"
    )