"""Chat between a learner and a teacher. It opens when the teacher accepts the request.

The frontend polls GET /api/chats/{id}?after_id=<last message id> every few seconds for new messages.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import Session, col, func, select

from ..emails import notify
from ..models import LessonRequest, Message, TeacherProfile, User
from ..schemas import ChatOut, ChatSummary, MessageIn, MessageOut
from ..security import CurrentUser, SessionDep
from ..views import OPEN_STATUSES, message_out, person, photo_url, request_out
from .requests import load_request
from .teacher import get_my_profile

router = APIRouter(prefix="/chats", tags=["Chats"])


def _last_read(request: LessonRequest, role: str) -> int:
    return request.learner_last_read_id if role == "learner" else request.teacher_last_read_id


def _unread(session: Session, request: LessonRequest, role: str, user: User) -> int:
    return session.exec(
        select(func.count()).where(
            Message.request_id == request.id,
            Message.sender_id != user.id,
            col(Message.id) > _last_read(request, role),
        )
    ).one()


def _open_chat(session: Session, request_id: int, user: User) -> tuple[LessonRequest, TeacherProfile, str]:
    request, teacher, role = load_request(session, request_id, user)
    if request.status not in OPEN_STATUSES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The chat opens after the teacher accepts the request")
    return request, teacher, role


@router.get("", response_model=list[ChatSummary])
def list_chats(
    user: CurrentUser,
    session: SessionDep,
    as_role: Annotated[Literal["learner", "teacher"] | None, Query(alias="as")] = None,
):
    """My conversations, newest first. `?as=learner` or `?as=teacher` keeps the two roles apart."""
    conditions = []
    if as_role in (None, "learner"):
        conditions.append(LessonRequest.learner_id == user.id)
    profile = get_my_profile(session, user)
    if profile and as_role in (None, "teacher"):
        conditions.append(LessonRequest.teacher_id == profile.id)
    if not conditions:
        return []
    requests = session.exec(
        select(LessonRequest).where(col(LessonRequest.status).in_(OPEN_STATUSES)).where(or_(*conditions))
    ).all()
    chats = []
    for request in requests:
        role = "learner" if request.learner_id == user.id else "teacher"
        teacher = session.get(TeacherProfile, request.teacher_id)
        if role == "learner":
            teacher_user = session.get(User, teacher.user_id)
            other = {"id": teacher_user.id, "name": teacher.display_name, "photo_url": photo_url(teacher_user.photo)}
        else:
            other = person(session.get(User, request.learner_id))
        last = session.exec(
            select(Message).where(Message.request_id == request.id).order_by(col(Message.id).desc())
        ).first()
        chats.append({
            "request_id": request.id,
            "my_role": role,
            "other": other,
            "subject": request.subject,
            "status": request.status,
            "answered_at": request.answered_at,
            "last_message": message_out(last, user) if last else None,
            "unread": _unread(session, request, role, user),
        })  # fmt: skip
    chats.sort(key=lambda c: c["last_message"]["created_at"] if c["last_message"] else c["answered_at"], reverse=True)
    return chats


@router.get("/{request_id}", response_model=ChatOut)
def get_chat(
    request_id: int, user: CurrentUser, session: SessionDep, after_id: Annotated[int, Query(ge=0)] = 0
):
    """The request (header, contact line) and messages newer than `after_id`. Marks them as read."""
    request, _, role = _open_chat(session, request_id, user)
    messages = session.exec(
        select(Message)
        .where(Message.request_id == request.id, col(Message.id) > after_id)
        .order_by(col(Message.id))
    ).all()
    if messages and messages[-1].id > _last_read(request, role):
        setattr(request, f"{role}_last_read_id", messages[-1].id)
        session.commit()
    return {"request": request_out(session, request, user), "messages": [message_out(m, user) for m in messages]}


@router.post("/{request_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(
    request_id: int, data: MessageIn, background: BackgroundTasks, user: CurrentUser, session: SessionDep
):
    request, teacher, role = _open_chat(session, request_id, user)
    if request.status != "accepted":
        raise HTTPException(status.HTTP_409_CONFLICT, "This conversation is closed")
    other_role = "teacher" if role == "learner" else "learner"
    other = session.get(User, teacher.user_id if role == "learner" else request.learner_id)
    # Email only about the first unread message, not about every message.
    first_unread = _unread(session, request, other_role, other) == 0
    message = Message(request_id=request.id, sender_id=user.id, text=data.text)
    session.add(message)
    session.flush()
    setattr(request, f"{role}_last_read_id", message.id)
    session.commit()
    session.refresh(message)
    if first_unread:
        name = user.full_name if role == "learner" else teacher.display_name
        notify(background, other, "notify_messages", f"New message from {name}", f"{name} wrote to you:\n\n{data.text}")
    return message_out(message, user)
