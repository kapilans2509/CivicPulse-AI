"""
User service — database operations for the User model.
"""
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User
from app.schemas.auth import UserRegister


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.lower()).first()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, data: UserRegister) -> User:
    """
    Create a new user with the citizen role.
    Public registration always produces a citizen account; the role is
    never taken from the request payload.  The caller is responsible for
    checking that the email does not already exist before calling this.
    """
    user = User(
        name=data.name.strip(),
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        role="citizen",  # never trust the client — hardcoded unconditionally
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
