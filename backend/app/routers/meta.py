"""Health check and the option lists for the frontend forms."""
from fastapi import APIRouter
from sqlmodel import select

from .. import config, vocab
from ..models import TeacherProfile
from ..security import SessionDep

router = APIRouter(tags=["Meta"])


@router.get("/health")
def health(session: SessionDep) -> dict:
    session.exec(select(1)).one()
    return {"status": "ok"}


@router.get("/meta")
def meta(session: SessionDep) -> dict:
    """Option lists for selects and chips, plus the platform rules (request limit, reply time)."""
    subjects = set(vocab.SUBJECTS)
    for profile_subjects in session.exec(
        select(TeacherProfile.subjects).where(TeacherProfile.status == "approved")
    ).all():
        subjects.update(profile_subjects)
    return {
        **vocab.options(),
        "subjects": sorted(subjects, key=str.casefold),
        "request_limit": config.REQUEST_LIMIT,
        "request_ttl_hours": config.REQUEST_TTL_HOURS,
        "review_edit_days": config.REVIEW_EDIT_DAYS,
    }
