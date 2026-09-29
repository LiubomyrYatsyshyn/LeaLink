"""Health check and the option lists for the frontend forms."""
from fastapi import APIRouter
from sqlmodel import select

from .. import catalog, config, vocab
from ..security import SessionDep

router = APIRouter(tags=["Meta"])


@router.get("/health")
def health(session: SessionDep) -> dict:
    session.exec(select(1)).one()
    return {"status": "ok"}


@router.get("/meta")
def meta() -> dict:
    """Option lists for selects and chips, plus the platform rules (request limit, reply time).

    `catalog`: the subjects grouped by category, and the fields each subject asks the teacher and the learner.
    """
    return {
        **vocab.options(),
        "subjects": catalog.NAMES,
        "catalog": catalog.meta(),
        "request_limit": config.REQUEST_LIMIT,
        "request_ttl_hours": config.REQUEST_TTL_HOURS,
        "review_edit_days": config.REVIEW_EDIT_DAYS,
    }
