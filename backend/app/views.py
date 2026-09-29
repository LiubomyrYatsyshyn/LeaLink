"""Turning database rows into API responses."""
import math
from dataclasses import dataclass

from sqlalchemy import extract, func
from sqlmodel import Session, col, select

from . import catalog
from .models import Certificate, LessonRequest, Message, Review, TeacherProfile, User, utcnow

OPEN_STATUSES = ("accepted", "closed")  # the chat and the teacher's contact are open


def photo_url(name: str | None) -> str | None:
    return f"/api/uploads/{name}" if name else None


def person(user: User) -> dict:
    return {"id": user.id, "name": user.full_name, "photo_url": photo_url(user.photo)}


def user_out(session: Session, user: User) -> dict:
    profile = session.exec(select(TeacherProfile).where(TeacherProfile.user_id == user.id)).first()
    return {
        **user.model_dump(exclude={"password_hash", "photo"}),
        "photo_url": photo_url(user.photo),
        "teacher_id": profile.id if profile else None,
        "teacher_status": profile.status if profile else None,
    }


# ---------- Teachers ----------

@dataclass
class Stats:
    rating: float | None = None
    reviews: int = 0
    response_hours: int | None = None


def teacher_stats(session: Session, profiles: list[TeacherProfile]) -> dict[int, Stats]:
    """Rating (learners' reviews) and average reply time for each profile id."""
    if not profiles:
        return {}
    stats = {p.id: Stats(response_hours=p.response_time_hours) for p in profiles}
    profile_by_user = {p.user_id: p.id for p in profiles}
    ratings = session.exec(
        select(Review.target_id, func.avg(Review.rating), func.count())
        .where(Review.author_role == "learner", col(Review.target_id).in_(list(profile_by_user)))
        .group_by(Review.target_id)
    ).all()
    for user_id, avg, count in ratings:
        stats[profile_by_user[user_id]].rating = round(float(avg), 1)
        stats[profile_by_user[user_id]].reviews = count
    hours = extract("epoch", col(LessonRequest.answered_at) - col(LessonRequest.created_at)) / 3600
    replies = session.exec(
        select(LessonRequest.teacher_id, func.avg(hours))
        .where(col(LessonRequest.answered_at).is_not(None), col(LessonRequest.teacher_id).in_(list(stats)))
        .group_by(LessonRequest.teacher_id)
    ).all()
    for teacher_id, avg in replies:
        stats[teacher_id].response_hours = max(1, math.ceil(float(avg)))
    return stats


def is_public(profile: TeacherProfile, user: User) -> bool:
    return profile.status == "approved" and not user.is_blocked


def certificate_out(cert: Certificate, with_file: bool) -> dict:
    data = cert.model_dump(exclude={"file_name", "teacher_id"})
    data["file_url"] = f"/api/teacher/certificates/{cert.id}/file" if with_file else None
    return data


def offers_view(offers: list[dict]) -> list[dict]:
    """The teacher's answers per subject as readable facts."""
    view = []
    for offer in offers:
        subject = catalog.get(offer.get("subject"))
        if subject:
            view.append({"subject": subject.name, "facts": catalog.describe_teacher(subject, offer.get("attrs", {}))})
    return view


def teacher_card(profile: TeacherProfile, user: User, stats: Stats, match: int | None = None) -> dict:
    return {
        **profile.model_dump(),
        "topics": catalog.card_tags(profile.offers),
        "photo_url": photo_url(user.photo),
        "display_name": profile.display_name or user.full_name,
        "rating": stats.rating,
        "reviews_count": stats.reviews,
        "response_hours": stats.response_hours,
        "match": match,
    }


def teacher_public(session: Session, profile: TeacherProfile, owner_view: bool = False) -> dict:
    user = session.get(User, profile.user_id)
    stats = teacher_stats(session, [profile])[profile.id]
    certs = session.exec(
        select(Certificate).where(Certificate.teacher_id == profile.id).order_by(col(Certificate.id))
    ).all()
    return {
        **teacher_card(profile, user, stats),
        "offers_view": offers_view(profile.offers),
        "certificates": [certificate_out(c, with_file=owner_view) for c in certs],
    }


# Wizard fields a profile needs before it can be sent to moderation.
REQUIRED_FIELDS = [
    "display_name", "headline", "about", "country", "city", "timezone", "languages",
    "subjects",
    "experience_years", "occupation",
    "format", "lesson_types", "durations",
    "price", "currency", "availability",
    "contact_method", "contact_value",
]  # fmt: skip
OPTIONAL_FIELDS = ["video_url", "practical_experience", "education", "links", "platforms", "questions"]


def _empty(value) -> bool:
    return value is None or value == "" or value == []


def missing_fields(profile: TeacherProfile, user: User) -> list[str]:
    missing = [name for name in REQUIRED_FIELDS if _empty(getattr(profile, name))]
    if not user.photo:
        missing.append("photo")
    if profile.about and len(profile.about) < 200:
        missing.append("about (at least 200 characters)")
    if profile.format in ("offline", "both"):
        missing += [f for f in ("offline_location", "travel_radius_km") if _empty(getattr(profile, f))]
    if profile.free_trial and not profile.trial_minutes:
        missing.append("trial_minutes")
    for offer in profile.offers:
        subject = catalog.get(offer.get("subject"))
        if subject:
            missing += [f"{subject.name}: {name}" for name in catalog.teacher_missing(subject, offer.get("attrs", {}))]
    return missing


def teacher_profile_out(session: Session, profile: TeacherProfile) -> dict:
    user = session.get(User, profile.user_id)
    data = teacher_public(session, profile, owner_view=True)
    missing = missing_fields(profile, user)
    has_cert = bool(data["certificates"])
    optional = [not _empty(getattr(profile, f)) for f in OPTIONAL_FIELDS] + [has_cert]
    required_done = len(REQUIRED_FIELDS) + 1 - len(missing)  # +1: photo
    total = len(REQUIRED_FIELDS) + 1 + len(optional)
    data["completeness"] = max(0, min(100, round(100 * (required_done + sum(optional)) / total)))
    data["missing"] = missing
    return data


# ---------- Requests ----------

def my_role(request: LessonRequest, user: User, teacher: TeacherProfile) -> str | None:
    if request.learner_id == user.id:
        return "learner"
    if teacher.user_id == user.id:
        return "teacher"
    return None


def review_out(session: Session, review: Review) -> dict:
    request = session.get(LessonRequest, review.request_id)
    return {
        **review.model_dump(),
        "author": person(session.get(User, review.author_id)),
        "subject": request.subject,
        "level": request.level,
    }


def request_out(session: Session, request: LessonRequest, me: User) -> dict:
    teacher = session.get(TeacherProfile, request.teacher_id)
    teacher_user = session.get(User, teacher.user_id)
    learner = session.get(User, request.learner_id)
    role = my_role(request, me, teacher)
    opened = request.status in OPEN_STATUSES
    review = session.exec(
        select(Review).where(Review.request_id == request.id, Review.author_id == me.id)
    ).first()
    started = bool(request.learner_started_at and request.teacher_started_at)
    hours_left = None
    if request.status == "pending":
        hours_left = max(0, math.ceil((request.expires_at - utcnow()).total_seconds() / 3600))
    subject = catalog.get(request.subject)
    data = {
        **request.model_dump(),
        "details": catalog.describe_learner(subject, request.attrs) if subject else [],
        "my_role": role,
        "teacher": {
            "id": teacher.id,
            "user_id": teacher_user.id,
            "name": teacher.display_name or teacher_user.full_name,
            "photo_url": photo_url(teacher_user.photo),
        },
        "learner": person(learner),
        "parent_contact": request.parent_contact if role == "learner" or opened else None,
        "teacher_contact": {"method": teacher.contact_method, "value": teacher.contact_value} if opened else None,
        "hours_left": hours_left,
        "learner_started": request.learner_started_at is not None,
        "teacher_started": request.teacher_started_at is not None,
        "lessons_started": started,
        "can_review": started and review is None,
        "my_review": review_out(session, review) if review else None,
    }
    if role == "teacher":
        avg, count = session.exec(
            select(func.avg(Review.rating), func.count()).where(
                Review.target_id == learner.id, Review.author_role == "teacher"
            )
        ).one()
        data["learner_rating"] = round(float(avg), 1) if avg is not None else None
        data["learner_reviews_count"] = count
    return data


def message_out(message: Message, me: User) -> dict:
    return {**message.model_dump(), "mine": message.sender_id == me.id}
