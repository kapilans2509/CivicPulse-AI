"""
Authentication router.

Endpoints:
  POST /auth/register  — create a new user account
  POST /auth/token     — OAuth2 password flow; returns JWT access token
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.schemas.auth import TokenResponse, UserRead, UserRegister
from app.services.user_service import create_user, get_user_by_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(data: UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user account.  Always creates a citizen-role account.
    Any role field in the request body is ignored; privileged roles
    (admin, officer, worker) can only be assigned by an administrator
    through a separate protected process.
    """
    if get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    return create_user(db, data)


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Login and obtain a JWT access token",
)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    OAuth2 password flow. Submit `username` (email) and `password` as
    form fields. Returns a bearer JWT and the authenticated user record.

    The generic error message intentionally does not distinguish between
    'unknown email' and 'wrong password' to prevent user enumeration.
    """
    user = get_user_by_email(db, form.username)
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(subject=str(user.id))
    return TokenResponse(
        access_token=token,
        user=UserRead.model_validate(user),
    )
