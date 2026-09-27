"""Public part: search teachers, teacher page, reviews, "Notify me" alerts."""
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import col, select

from ..matching import SearchFilters, SearchQuery, search
from ..models import Review, SearchAlert, TeacherProfile, User
from ..schemas import AlertOut, ReviewOut, SearchResult, TeacherPublic
from ..security import CurrentUser, OptionalUser, SessionDep
from ..views import is_public, review_out, teacher_public

router = APIRouter(tags=["Teachers (public)"])


@router.get("/teachers/search", response_model=SearchResult)
def search_teachers(q: Annotated[SearchQuery, Query()], session: SessionDep):
    """Search published teachers. No account needed.

    Lists are repeated parameters: `?subject=English&topics=Speaking&topics=Job interviews&times=evening`.
    If nothing is found, `relax` says which single filter to remove and how many teachers that would show.
    """
    return search(session, q)


@router.get("/teachers/{teacher_id}", response_model=TeacherPublic)
def get_teacher(teacher_id: int, session: SessionDep, user: OptionalUser):
    """Teacher page. Unpublished profiles are visible only to their owner and moderators."""
    profile = session.get(TeacherProfile, teacher_id)
    owner = profile is not None and user is not None and (user.id == profile.user_id or user.is_admin)
    if profile is None or not (owner or is_public(profile, session.get(User, profile.user_id))):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teacher not found")
    return teacher_public(session, profile)


@router.get("/teachers/{teacher_id}/reviews", response_model=list[ReviewOut])
def teacher_reviews(
    teacher_id: int,
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
):
    """Learners' reviews of the teacher, newest first."""
    profile = session.get(TeacherProfile, teacher_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teacher not found")
    reviews = session.exec(
        select(Review)
        .where(Review.target_id == profile.user_id, Review.author_role == "learner")
        .order_by(col(Review.created_at).desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [review_out(session, r) for r in reviews]


@router.post("/alerts", response_model=AlertOut, status_code=status.HTTP_201_CREATED, tags=["Search alerts"])
def create_alert(filters: SearchFilters, user: CurrentUser, session: SessionDep):
    """The "Notify me" button: we email you once, when a teacher matching these filters is published."""
    active = session.exec(
        select(SearchAlert).where(SearchAlert.user_id == user.id, col(SearchAlert.is_active).is_(True))
    ).all()
    if len(active) >= 10:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have 10 active alerts")
    alert = SearchAlert(user_id=user.id, filters=filters.model_dump(mode="json"))
    if not user.notify_matching:
        user.notify_matching = True  # the learner just asked to be notified
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


@router.get("/alerts", response_model=list[AlertOut], tags=["Search alerts"])
def list_alerts(user: CurrentUser, session: SessionDep):
    return session.exec(
        select(SearchAlert).where(SearchAlert.user_id == user.id).order_by(col(SearchAlert.id).desc())
    ).all()


@router.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Search alerts"])
def delete_alert(alert_id: int, user: CurrentUser, session: SessionDep):
    alert = session.get(SearchAlert, alert_id)
    if alert is None or alert.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    session.delete(alert)
    session.commit()
