"""Passwords, JWT tokens and the "current user" dependencies."""
from datetime import timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlmodel import Session

from . import config
from .db import get_session
from .models import User, utcnow

password_hasher = PasswordHash.recommended()
DUMMY_HASH = password_hasher.hash("timing-attack-guard")
bearer = HTTPBearer(auto_error=False, description="Token from /api/auth/login or /api/auth/register")

SessionDep = Annotated[Session, Depends(get_session)]


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        password_hasher.verify(password, DUMMY_HASH)  # same timing for unknown emails
        return False
    return password_hasher.verify(password, password_hash)


def _pwd_stamp(user: User) -> int:
    # Tokens carry the time of the last password change, so changing it logs out other devices.
    return int(user.password_changed_at.timestamp() * 1000)


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "pwd": _pwd_stamp(user),
        "exp": utcnow() + timedelta(hours=config.TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, config.secret_key(), algorithm="HS256")


def _unauthorized(detail: str = "Log in first") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})


def _user_from_token(session: Session, token: str) -> User:
    try:
        payload = jwt.decode(token, config.secret_key(), algorithms=["HS256"])
        user = session.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized("Session expired, log in again") from None
    if user is None or payload.get("pwd") != _pwd_stamp(user):
        raise _unauthorized("Session expired, log in again")
    if user.is_blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is blocked")
    return user


def get_current_user(
    session: SessionDep, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    if creds is None:
        raise _unauthorized()
    return _user_from_token(session, creds.credentials)


def get_optional_user(
    session: SessionDep, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User | None:
    """For public pages: a missing or stale token just means a guest."""
    if creds is None:
        return None
    try:
        return _user_from_token(session, creds.credentials)
    except HTTPException:
        return None


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderators only")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
AdminUser = Annotated[User, Depends(require_admin)]
