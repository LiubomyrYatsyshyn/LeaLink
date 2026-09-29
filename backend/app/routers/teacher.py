"""The teacher's own profile (wizard), moderation submit and certificates."""
from typing import Annotated

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session, func, select

from .. import catalog, config, files
from ..models import Certificate, TeacherProfile, User, utcnow
from ..schemas import CertificateOut, TeacherProfileIn, TeacherProfileOut
from ..security import CurrentUser, SessionDep
from ..views import certificate_out, missing_fields, teacher_profile_out

router = APIRouter(prefix="/teacher", tags=["Teacher profile (mine)"])


def get_my_profile(session: Session, user: User) -> TeacherProfile | None:
    return session.exec(select(TeacherProfile).where(TeacherProfile.user_id == user.id)).first()


def _require_profile(session: Session, user: User) -> TeacherProfile:
    profile = get_my_profile(session, user)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You don't have a teacher profile yet")
    return profile


def clean_offers(offers: list[dict]) -> list[dict]:
    """Subjects from the catalog (each once) with their answers checked against the subject's fields."""
    cleaned, seen = [], set()
    for offer in offers:
        subject = catalog.get(offer["subject"])
        if subject is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown subject: {offer['subject']}. Pick one from the list."
            )
        if subject.name not in seen:
            seen.add(subject.name)
            cleaned.append({"subject": subject.name, "attrs": catalog.clean_teacher(subject, offer["attrs"])})
    return cleaned


def _default(field: str):
    info = TeacherProfile.model_fields[field]
    return info.default_factory() if info.default_factory else info.default


@router.get("/profile", response_model=TeacherProfileOut)
def my_profile(user: CurrentUser, session: SessionDep):
    return teacher_profile_out(session, _require_profile(session, user))


@router.put("/profile", response_model=TeacherProfileOut)
def save_profile(data: TeacherProfileIn, user: CurrentUser, session: SessionDep):
    """Create or update the profile ("Saved as draft"). Send the fields of one or more wizard steps.

    Changing a published profile sends it back to moderation (except the "Accepting new students" switch).
    """
    profile = get_my_profile(session, user)
    if profile is None:
        profile = TeacherProfile(user_id=user.id, display_name=user.full_name, timezone=user.timezone)
        session.add(profile)
    values = data.model_dump(exclude_unset=True)
    if values.get("offers") is not None:
        values["offers"] = clean_offers(values["offers"])
        values["subjects"] = [o["subject"] for o in values["offers"]]
    content_changed = False
    for field, value in values.items():
        if value is None:
            value = user.full_name if field == "display_name" else _default(field)
        if getattr(profile, field) != value:
            setattr(profile, field, value)
            content_changed = content_changed or field != "accepting_students"
    if profile.status == "approved" and content_changed:
        profile.status = "pending"
        profile.submitted_at = utcnow()
    profile.updated_at = utcnow()
    session.commit()
    session.refresh(profile)
    return teacher_profile_out(session, profile)


@router.post("/profile/submit", response_model=TeacherProfileOut)
def submit_profile(user: CurrentUser, session: SessionDep):
    """Send the profile to moderation. Learners see it after a moderator approves it."""
    profile = _require_profile(session, user)
    if profile.status in ("draft", "rejected"):
        missing = missing_fields(profile, user)
        if missing:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                {"message": "Fill in the required fields first", "missing": missing},
            )
        profile.status = "pending"
        profile.submitted_at = utcnow()
        profile.review_note = None
        session.commit()
        session.refresh(profile)
    return teacher_profile_out(session, profile)


@router.post("/certificates", response_model=CertificateOut, status_code=status.HTTP_201_CREATED)
def upload_certificate(
    file: UploadFile,
    user: CurrentUser,
    session: SessionDep,
    title: Annotated[str | None, Form(max_length=120)] = None,
):
    """PDF, JPG or PNG up to 10 MB. Moderators check certificates and may give the Verified badge."""
    profile = _require_profile(session, user)
    count = session.exec(select(func.count()).where(Certificate.teacher_id == profile.id)).one()
    if count >= 5:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can upload up to 5 certificates")
    name, size = files.save_upload(file, config.PRIVATE_DIR, files.DOCUMENTS, max_mb=10)
    cert = Certificate(
        teacher_id=profile.id,
        title=(title or file.filename or "Certificate").strip()[:120],
        file_name=name,
        content_type=file.content_type,
        size=size,
    )
    session.add(cert)
    session.commit()
    session.refresh(cert)
    return certificate_out(cert, with_file=True)


@router.delete("/certificates/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_certificate(cert_id: int, user: CurrentUser, session: SessionDep):
    profile = _require_profile(session, user)
    cert = session.get(Certificate, cert_id)
    if cert is None or cert.teacher_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    files.delete_file(config.PRIVATE_DIR, cert.file_name)
    session.delete(cert)
    session.commit()


@router.get("/certificates/{cert_id}/file", response_class=FileResponse)
def download_certificate(cert_id: int, user: CurrentUser, session: SessionDep):
    """For the owner and moderators only."""
    cert = session.get(Certificate, cert_id)
    profile = session.get(TeacherProfile, cert.teacher_id) if cert else None
    if cert is None or not (user.is_admin or profile.user_id == user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    path = config.PRIVATE_DIR / cert.file_name
    return FileResponse(path, media_type=cert.content_type, filename=cert.title + path.suffix)
