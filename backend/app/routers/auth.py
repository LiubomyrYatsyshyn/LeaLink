"""Sign up, log in and account settings."""
from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlmodel import Session, select

from .. import config, files
from ..models import User, utcnow
from ..schemas import LoginIn, PasswordIn, RegisterIn, SettingsIn, TokenOut, UserOut
from ..security import CurrentUser, SessionDep, create_token, hash_password, verify_password
from ..views import user_out

router = APIRouter(prefix="/auth", tags=["Account"])


def _token(session: Session, user: User) -> dict:
    return {"access_token": create_token(user), "user": user_out(session, user)}


def _email_taken(session: Session, email: str) -> bool:
    return session.exec(select(User).where(User.email == email)).first() is not None


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, session: SessionDep):
    """Create an account. Anyone can learn; to teach, fill in the teacher profile afterwards."""
    email = data.email.lower()
    if _email_taken(session, email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(
        email=email,
        full_name=data.full_name,
        password_hash=hash_password(data.password),
        timezone=data.timezone,
        notify_requests=data.notify_requests,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _token(session, user)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, session: SessionDep):
    """Returns a token. Send it as `Authorization: Bearer <token>`. To log out, forget the token."""
    user = session.exec(select(User).where(User.email == data.email.lower())).first()
    if not verify_password(data.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    if user.is_blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is blocked")
    return _token(session, user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, session: SessionDep):
    return user_out(session, user)


@router.patch("/me", response_model=UserOut)
def update_settings(data: SettingsIn, user: CurrentUser, session: SessionDep):
    changes = data.model_dump(exclude_unset=True)
    if changes.get("email"):
        changes["email"] = changes["email"].lower()
        if changes["email"] != user.email and _email_taken(session, changes["email"]):
            raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    for key, value in changes.items():
        if value is not None or key == "country":
            setattr(user, key, value)
    session.commit()
    session.refresh(user)
    return user_out(session, user)


@router.post("/me/photo", response_model=UserOut)
def upload_photo(file: UploadFile, user: CurrentUser, session: SessionDep):
    """Profile photo (JPG, PNG or WebP, up to 5 MB). Teachers use the same photo on their profile."""
    name, _ = files.save_upload(file, config.UPLOAD_DIR, files.IMAGES, max_mb=5)
    files.delete_file(config.UPLOAD_DIR, user.photo)
    user.photo = name
    session.commit()
    session.refresh(user)
    return user_out(session, user)


@router.delete("/me/photo", response_model=UserOut)
def delete_photo(user: CurrentUser, session: SessionDep):
    files.delete_file(config.UPLOAD_DIR, user.photo)
    user.photo = None
    session.commit()
    session.refresh(user)
    return user_out(session, user)


@router.post("/change-password", response_model=TokenOut)
def change_password(data: PasswordIn, user: CurrentUser, session: SessionDep):
    """Logs out all other devices and returns a new token for this one."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The current password is wrong")
    user.password_hash = hash_password(data.new_password)
    user.password_changed_at = utcnow()
    session.commit()
    session.refresh(user)
    return _token(session, user)
