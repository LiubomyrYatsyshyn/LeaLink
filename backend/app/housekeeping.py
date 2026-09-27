"""Request deadlines: expire requests after 72 hours and warn learners 12 hours before."""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import update
from sqlmodel import Session, col, select

from . import config, emails
from .db import new_session
from .models import LessonRequest, TeacherProfile, User, utcnow

log = logging.getLogger("lealink.housekeeping")


def expire_overdue(session: Session) -> None:
    """Mark pending requests past their deadline as expired (frees the learner's slot)."""
    now = utcnow()
    session.exec(
        update(LessonRequest)
        .where(col(LessonRequest.status) == "pending", col(LessonRequest.expires_at) <= now)
        .values(status="expired", finished_at=now)
    )
    session.commit()


def send_expiry_warnings(session: Session) -> None:
    soon = utcnow() + timedelta(hours=config.EXPIRY_WARNING_HOURS)
    requests = session.exec(
        select(LessonRequest).where(
            LessonRequest.status == "pending",
            col(LessonRequest.expires_at) <= soon,
            col(LessonRequest.expiry_warning_sent).is_(False),
        )
    ).all()
    outbox = []
    for request in requests:
        request.expiry_warning_sent = True
        learner = session.get(User, request.learner_id)
        teacher = session.get(TeacherProfile, request.teacher_id)
        if learner.notify_expiring and not learner.is_blocked:
            text = (
                f"{teacher.display_name} hasn't replied to your {request.subject} request yet. "
                f"It expires in less than {config.EXPIRY_WARNING_HOURS} hours. After that it stops counting "
                "toward your limit, and you can send a request to another teacher."
            )
            outbox.append((learner.email, "Your request expires soon", text))
    session.commit()
    for to, subject, text in outbox:
        emails.send_email(to, subject, text)


def run_once() -> None:
    with new_session() as session:
        expire_overdue(session)
        send_expiry_warnings(session)


async def loop() -> None:
    while True:
        try:
            await asyncio.to_thread(run_once)
        except Exception:
            log.exception("Housekeeping failed")
        await asyncio.sleep(config.HOUSEKEEPING_INTERVAL)
