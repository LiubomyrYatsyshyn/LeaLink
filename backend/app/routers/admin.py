"""Moderation: approve or reject teacher profiles, handle reports, block users. Admins only."""
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import Session, col, select

from ..emails import notify
from ..matching import SearchFilters, profile_matches
from ..models import Report, SearchAlert, TeacherProfile, User, utcnow
from ..schemas import AdminUserOut, ApproveIn, RejectIn, ReportOut, ResolveIn, TeacherProfileOut
from ..security import AdminUser, SessionDep, require_admin
from ..views import person, teacher_profile_out

router = APIRouter(prefix="/admin", tags=["Moderation (admins)"], dependencies=[Depends(require_admin)])


def _profile(session: Session, teacher_id: int) -> TeacherProfile:
    profile = session.get(TeacherProfile, teacher_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teacher not found")
    return profile


@router.get("/teachers", response_model=list[TeacherProfileOut])
def list_profiles(
    session: SessionDep,
    profile_status: Annotated[Literal["pending", "approved", "rejected", "draft"], Query(alias="status")] = "pending",
):
    """Profiles waiting for review (oldest first), or with another status."""
    profiles = session.exec(
        select(TeacherProfile)
        .where(TeacherProfile.status == profile_status)
        .order_by(col(TeacherProfile.submitted_at), col(TeacherProfile.id))
    ).all()
    return [teacher_profile_out(session, p) for p in profiles]


@router.get("/teachers/{teacher_id}", response_model=TeacherProfileOut)
def get_profile(teacher_id: int, session: SessionDep):
    return teacher_profile_out(session, _profile(session, teacher_id))


def _notify_alerts(session: Session, background: BackgroundTasks, profile: TeacherProfile) -> None:
    """Email learners whose saved search ("Notify me") matches the newly published teacher."""
    alerts = session.exec(select(SearchAlert).where(col(SearchAlert.is_active).is_(True))).all()
    for alert in alerts:
        if alert.user_id == profile.user_id or not profile_matches(session, profile, SearchFilters(**alert.filters)):
            continue
        alert.is_active = False
        alert.notified_at = utcnow()
        notify(
            background, session.get(User, alert.user_id), "notify_matching",
            f"A {alert.filters['subject']} teacher for you joined LeaLink",
            f"{profile.display_name} matches your search: {profile.headline}\n"
            "Open LeaLink to see the profile and send a request.",
            link=f"teacher.html?id={profile.id}", button="View profile", tag="search-alert",
        )  # fmt: skip
    session.commit()


@router.post("/teachers/{teacher_id}/approve", response_model=TeacherProfileOut)
def approve(teacher_id: int, data: ApproveIn, background: BackgroundTasks, session: SessionDep):
    """Publish the profile: it appears in search and can receive requests."""
    profile = _profile(session, teacher_id)
    if profile.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"The profile is {profile.status}, not pending")
    first_time = profile.published_at is None
    profile.status = "approved"
    profile.is_verified = data.verified
    profile.review_note = None
    profile.published_at = profile.published_at or utcnow()
    session.commit()
    notify(
        background, session.get(User, profile.user_id), None, "Your teacher profile is published",
        "Good news: your profile passed the review. Learners can now find you and send requests.",
        link="teacher-home.html", button="Open my teaching page", tag="profile-approved",
    )  # fmt: skip
    if first_time:
        _notify_alerts(session, background, profile)
    return teacher_profile_out(session, profile)


@router.post("/teachers/{teacher_id}/reject", response_model=TeacherProfileOut)
def reject(teacher_id: int, data: RejectIn, background: BackgroundTasks, session: SessionDep):
    """Send the profile back to the teacher with a note on what to fix."""
    profile = _profile(session, teacher_id)
    if profile.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"The profile is {profile.status}, not pending")
    profile.status = "rejected"
    profile.review_note = data.note
    session.commit()
    notify(
        background, session.get(User, profile.user_id), None, "Your teacher profile needs changes",
        f"We couldn't publish your profile yet.\n\nModerator's note: {data.note}\n\n"
        "Edit your profile and submit it again.",
        link="wizard.html", button="Edit my profile", tag="profile-rejected",
    )  # fmt: skip
    return teacher_profile_out(session, profile)


def _report_out(session: Session, report: Report) -> dict:
    return {
        **report.model_dump(),
        "reporter": person(session.get(User, report.reporter_id)),
        "reported": person(session.get(User, report.reported_user_id)),
    }


@router.get("/reports", response_model=list[ReportOut])
def list_reports(
    session: SessionDep,
    report_status: Annotated[Literal["open", "resolved"], Query(alias="status")] = "open",
):
    reports = session.exec(
        select(Report).where(Report.status == report_status).order_by(col(Report.id).desc())
    ).all()
    return [_report_out(session, r) for r in reports]


@router.post("/reports/{report_id}/resolve", response_model=ReportOut)
def resolve_report(report_id: int, data: ResolveIn, session: SessionDep):
    report = session.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    report.status = "resolved"
    report.admin_note = data.note
    report.resolved_at = utcnow()
    session.commit()
    return _report_out(session, report)


def _admin_user_out(session: Session, user: User) -> dict:
    profile = session.exec(select(TeacherProfile).where(TeacherProfile.user_id == user.id)).first()
    return {
        **user.model_dump(),
        "teacher_id": profile.id if profile else None,
        "teacher_status": profile.status if profile else None,
    }


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100, description="Part of the name or email")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    query = select(User).order_by(col(User.id).desc()).limit(limit)
    if q:
        query = query.where(or_(col(User.email).icontains(q), col(User.full_name).icontains(q)))
    return [_admin_user_out(session, u) for u in session.exec(query).all()]


def _set_blocked(session: Session, user_id: int, admin: User, blocked: bool) -> dict:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't block yourself")
    user.is_blocked = blocked
    session.commit()
    return _admin_user_out(session, user)


@router.post("/users/{user_id}/block", response_model=AdminUserOut)
def block_user(user_id: int, admin: AdminUser, session: SessionDep):
    """A blocked user can't log in, and their teacher profile disappears from search."""
    return _set_blocked(session, user_id, admin, True)


@router.post("/users/{user_id}/unblock", response_model=AdminUserOut)
def unblock_user(user_id: int, admin: AdminUser, session: SessionDep):
    return _set_blocked(session, user_id, admin, False)
