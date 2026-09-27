"""Requests between learners and teachers: send, withdraw, accept, decline, "we started lessons", reviews."""
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlmodel import Session, col, func, select

from .. import config
from ..emails import notify
from ..housekeeping import expire_overdue
from ..models import LessonRequest, Review, TeacherProfile, User, utcnow
from ..schemas import DeclineIn, RequestIn, RequestOut, ReviewIn, ReviewOut, SentRequests
from ..security import CurrentUser, SessionDep
from ..views import OPEN_STATUSES, is_public, my_role, request_out, review_out
from .teacher import get_my_profile

router = APIRouter(prefix="/requests", tags=["Requests"])


def load_request(session: Session, request_id: int, user: User) -> tuple[LessonRequest, TeacherProfile, str]:
    """The request and the current user's role in it. 404 for strangers."""
    request = session.get(LessonRequest, request_id)
    teacher = session.get(TeacherProfile, request.teacher_id) if request else None
    role = my_role(request, user, teacher) if request else None
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return request, teacher, role


def _require(condition: bool, code: int, message: str) -> None:
    if not condition:
        raise HTTPException(code, message)


def _require_pending(session: Session, request: LessonRequest) -> None:
    if request.status == "pending" and request.expires_at <= utcnow():
        expire_overdue(session)
        session.refresh(request)
    _require(request.status == "pending", status.HTTP_409_CONFLICT, f"The request is already {request.status}")


def active_count(session: Session, learner_id: int) -> int:
    return session.exec(
        select(func.count()).where(
            LessonRequest.learner_id == learner_id,
            LessonRequest.status == "pending",
            col(LessonRequest.expires_at) > utcnow(),
        )
    ).one()


@router.post("", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
def send_request(data: RequestIn, background: BackgroundTasks, user: CurrentUser, session: SessionDep):
    """Send a request to a teacher. Up to 5 pending requests at a time; the teacher has 72 hours to reply."""
    teacher = session.get(TeacherProfile, data.teacher_id)
    teacher_user = session.get(User, teacher.user_id) if teacher else None
    _require(teacher is not None and is_public(teacher, teacher_user), 404, "Teacher not found")
    _require(teacher.user_id != user.id, 400, "You can't send a request to yourself")
    _require(teacher.accepting_students, 409, "This teacher isn't accepting new students right now")
    expire_overdue(session)
    duplicate = session.exec(
        select(LessonRequest).where(
            LessonRequest.learner_id == user.id,
            LessonRequest.teacher_id == teacher.id,
            col(LessonRequest.status).in_(["pending", "accepted"]),
        )
    ).first()
    _require(duplicate is None, 409, "You already have an open request to this teacher")
    _require(
        active_count(session, user.id) < config.REQUEST_LIMIT,
        409,
        f"You already have {config.REQUEST_LIMIT} active requests. Wait for replies or withdraw one.",
    )
    request = LessonRequest(
        **data.model_dump(exclude={"teacher_id"}),
        learner_id=user.id,
        teacher_id=teacher.id,
        expires_at=utcnow() + timedelta(hours=config.REQUEST_TTL_HOURS),
    )
    request.free_trial = data.free_trial and teacher.free_trial
    session.add(request)
    session.commit()
    session.refresh(request)
    notify(
        background, teacher_user, "notify_requests", f"New request from {user.full_name}",
        f"{user.full_name} sent you a request: {request.subject}, {request.goal}.\n\n\"{request.message}\"\n\n"
        f"Accept or decline it within {config.REQUEST_TTL_HOURS} hours on your LeaLink home page.",
    )  # fmt: skip
    return request_out(session, request, user)


@router.get("/sent", response_model=SentRequests)
def sent_requests(user: CurrentUser, session: SessionDep):
    """Learner home: all my requests (the frontend groups them into Sent / Accepted / Declined)."""
    expire_overdue(session)
    requests = session.exec(
        select(LessonRequest).where(LessonRequest.learner_id == user.id).order_by(col(LessonRequest.id).desc())
    ).all()
    return {
        "active": active_count(session, user.id),
        "limit": config.REQUEST_LIMIT,
        "items": [request_out(session, r, user) for r in requests],
    }


@router.get("/incoming", response_model=list[RequestOut])
def incoming_requests(user: CurrentUser, session: SessionDep):
    """Teacher home: requests waiting for my answer, the most urgent first."""
    profile = get_my_profile(session, user)
    if profile is None:
        return []
    expire_overdue(session)
    requests = session.exec(
        select(LessonRequest)
        .where(LessonRequest.teacher_id == profile.id, LessonRequest.status == "pending")
        .order_by(col(LessonRequest.expires_at))
    ).all()
    return [request_out(session, r, user) for r in requests]


@router.get("/students", response_model=list[RequestOut])
def my_students(user: CurrentUser, session: SessionDep):
    """Teacher home: learners whose requests I accepted."""
    profile = get_my_profile(session, user)
    if profile is None:
        return []
    requests = session.exec(
        select(LessonRequest)
        .where(LessonRequest.teacher_id == profile.id, col(LessonRequest.status).in_(OPEN_STATUSES))
        .order_by(col(LessonRequest.answered_at).desc())
    ).all()
    return [request_out(session, r, user) for r in requests]


@router.get("/{request_id}", response_model=RequestOut)
def get_request(request_id: int, user: CurrentUser, session: SessionDep):
    """The full request ("View full request"), for the learner and the teacher."""
    request, _, _ = load_request(session, request_id, user)
    return request_out(session, request, user)


@router.post("/{request_id}/withdraw", response_model=RequestOut)
def withdraw(request_id: int, user: CurrentUser, session: SessionDep):
    request, _, role = load_request(session, request_id, user)
    _require(role == "learner", 403, "Only the learner can withdraw a request")
    _require_pending(session, request)
    request.status = "withdrawn"
    request.finished_at = utcnow()
    session.commit()
    return request_out(session, request, user)


@router.post("/{request_id}/accept", response_model=RequestOut)
def accept(request_id: int, background: BackgroundTasks, user: CurrentUser, session: SessionDep):
    """Accept: the chat opens and the learner sees the teacher's contact."""
    request, teacher, role = load_request(session, request_id, user)
    _require(role == "teacher", 403, "Only the teacher can accept a request")
    _require_pending(session, request)
    request.status = "accepted"
    request.answered_at = utcnow()
    session.commit()
    notify(
        background, session.get(User, request.learner_id), "notify_requests", f"{teacher.display_name} accepted your request",
        f"{teacher.display_name} accepted your {request.subject} request. "
        "The chat is open — agree on the schedule and price there.",
    )  # fmt: skip
    return request_out(session, request, user)


@router.post("/{request_id}/decline", response_model=RequestOut)
def decline(
    request_id: int, data: DeclineIn, background: BackgroundTasks, user: CurrentUser, session: SessionDep
):
    request, teacher, role = load_request(session, request_id, user)
    _require(role == "teacher", 403, "Only the teacher can decline a request")
    _require_pending(session, request)
    request.status = "declined"
    request.decline_reason = data.reason
    request.decline_note = data.note or None
    request.answered_at = utcnow()
    session.commit()
    note = f"\nNote from {teacher.display_name}: {request.decline_note}" if request.decline_note else ""
    notify(
        background, session.get(User, request.learner_id), "notify_requests", f"{teacher.display_name} declined your request",
        f"{teacher.display_name} declined your {request.subject} request.\nReason: {request.decline_reason}{note}\n\n"
        "This request no longer counts toward your limit — you can send a request to another teacher.",
    )  # fmt: skip
    return request_out(session, request, user)


@router.post("/{request_id}/started", response_model=RequestOut)
def lessons_started(request_id: int, background: BackgroundTasks, user: CurrentUser, session: SessionDep):
    """The "We started lessons" button. When both sides confirm, they can leave reviews."""
    request, teacher, role = load_request(session, request_id, user)
    _require(request.status in OPEN_STATUSES, 409, "The teacher hasn't accepted this request")
    field = f"{role}_started_at"
    if getattr(request, field) is None:
        setattr(request, field, utcnow())
        session.commit()
        other_started = request.teacher_started_at if role == "learner" else request.learner_started_at
        if other_started is None:
            other = session.get(User, teacher.user_id if role == "learner" else request.learner_id)
            name = user.full_name if role == "learner" else teacher.display_name
            notify(
                background, other, "notify_requests", f"{name} confirmed that lessons started",
                f"{name} confirmed that your {request.subject} lessons started. "
                "Please confirm it too on LeaLink — then you can both leave a review.",
            )  # fmt: skip
    return request_out(session, request, user)


@router.post("/{request_id}/close", response_model=RequestOut)
def close(request_id: int, background: BackgroundTasks, user: CurrentUser, session: SessionDep):
    """The teacher stops working with this learner. The chat stays readable but closed."""
    request, teacher, role = load_request(session, request_id, user)
    _require(role == "teacher", 403, "Only the teacher can end the cooperation")
    _require(request.status == "accepted", 409, f"The request is {request.status}")
    request.status = "closed"
    request.finished_at = utcnow()
    session.commit()
    notify(
        background, session.get(User, request.learner_id), "notify_requests", f"{teacher.display_name} ended the lessons",
        f"{teacher.display_name} ended your {request.subject} lessons on LeaLink. You can find another teacher at any time.",
    )  # fmt: skip
    return request_out(session, request, user)


def _my_review(session: Session, request: LessonRequest, user: User) -> Review | None:
    return session.exec(select(Review).where(Review.request_id == request.id, Review.author_id == user.id)).first()


@router.post("/{request_id}/review", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def leave_review(request_id: int, data: ReviewIn, user: CurrentUser, session: SessionDep):
    """Review the other side. Possible once both confirmed that lessons started."""
    request, teacher, role = load_request(session, request_id, user)
    _require(
        request.learner_started_at is not None and request.teacher_started_at is not None,
        409,
        "Reviews open when you both confirm that lessons started",
    )
    _require(_my_review(session, request, user) is None, 409, "You already reviewed this. Edit your review instead.")
    review = Review(
        request_id=request.id,
        author_id=user.id,
        target_id=teacher.user_id if role == "learner" else request.learner_id,
        author_role=role,
        rating=data.rating,
        text=data.text,
    )
    session.add(review)
    session.commit()
    session.refresh(review)
    return review_out(session, review)


@router.patch("/{request_id}/review", response_model=ReviewOut)
def edit_review(request_id: int, data: ReviewIn, user: CurrentUser, session: SessionDep):
    """Edit my review within 14 days."""
    request, _, _ = load_request(session, request_id, user)
    review = _my_review(session, request, user)
    _require(review is not None, 404, "Review not found")
    _require(
        utcnow() - review.created_at <= timedelta(days=config.REVIEW_EDIT_DAYS),
        409,
        f"Reviews can be edited within {config.REVIEW_EDIT_DAYS} days",
    )
    review.rating = data.rating
    review.text = data.text
    review.updated_at = utcnow()
    session.commit()
    session.refresh(review)
    return review_out(session, review)
