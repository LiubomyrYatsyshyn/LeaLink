"""The "Report" button on teacher cards, teacher pages and in chats."""
from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from ..models import Report, TeacherProfile
from ..schemas import ReportIn
from ..security import CurrentUser, SessionDep
from .requests import load_request

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_report(data: ReportIn, user: CurrentUser, session: SessionDep) -> dict:
    """Report a teacher profile (`teacher_id`) or the other person in a chat (`request_id`)."""
    if data.teacher_id is not None:
        profile = session.get(TeacherProfile, data.teacher_id)
        if profile is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Teacher not found")
        reported_id, teacher_id = profile.user_id, profile.id
    else:
        request, teacher, role = load_request(session, data.request_id, user)
        reported_id = teacher.user_id if role == "learner" else request.learner_id
        teacher_id = teacher.id if role == "learner" else None
    if reported_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't report yourself")
    already = session.exec(
        select(Report).where(
            Report.reporter_id == user.id, Report.reported_user_id == reported_id, Report.status == "open"
        )
    ).first()
    if already:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already reported this. Our moderators are looking into it.")
    report = Report(
        reporter_id=user.id,
        reported_user_id=reported_id,
        teacher_id=teacher_id,
        request_id=data.request_id,
        reason=data.reason,
        details=data.details,
    )
    session.add(report)
    session.commit()
    return {"id": report.id, "status": report.status, "message": "Thanks. Our moderators will review this report."}
