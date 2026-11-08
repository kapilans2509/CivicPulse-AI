"""
FastAPI auth dependencies.

  get_current_user  — validate Bearer JWT → return User ORM object
  require_role      — factory that returns a dependency enforcing a role set
"""
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import ExpiredSignatureError, JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.services.user_service import get_user_by_id

# The tokenUrl must match the login endpoint registered in main.py
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

VALID_ROLES = {"citizen", "officer", "worker", "admin"}


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Decode the Bearer JWT, validate its signature and expiry, then load
    and return the corresponding User row.

    Raises HTTP 401 for any token problem (missing, malformed, expired,
    unknown subject).  Never leaks the specific failure reason to callers
    to avoid information disclosure.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exc

    user = get_user_by_id(db, int(user_id))
    if user is None:
        raise credentials_exc
    return user


def require_role(*roles: str) -> Callable:
    """
    Dependency factory.  Usage::

        @router.get("/admin-only")
        def endpoint(user: User = Depends(require_role("admin"))):
            ...

        @router.get("/staff")
        def endpoint(user: User = Depends(require_role("officer", "admin"))):
            ...

    Returns the authenticated user on success; raises HTTP 403 otherwise.
    """
    for r in roles:
        if r not in VALID_ROLES:
            raise ValueError(f"Unknown role '{r}' passed to require_role()")

    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access requires one of these roles: {sorted(roles)}.",
            )
        return current_user

    return _dependency
