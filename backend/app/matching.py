"""Teacher search: strict filters, match %, and hints for an empty result.

Published teachers of the chosen subject are loaded and filtered in Python.
That is simple and fast enough for an MVP (thousands of profiles).
"""
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from . import vocab
from .models import TeacherProfile, User
from .views import Stats, teacher_card, teacher_stats


class SearchFilters(BaseModel):
    """The "Find a teacher" form. Only the subject is required."""

    subject: str = Field(min_length=1, max_length=40)
    # Soft criteria: they change the match %, they don't hide teachers.
    topics: list[str] = []
    for_whom: vocab.ForWhom | None = None
    level: vocab.Level | None = None
    goal: vocab.Goal | None = None
    times: list[vocab.TimePref] = []
    # Strict filters: a teacher must pass all of them.
    format: vocab.Format | None = None
    city: str | None = Field(None, max_length=40, description="Used for offline lessons")
    language: str | None = Field(None, max_length=40, description="Lesson language")
    lesson_type: vocab.LessonType | None = None
    min_experience: int | None = Field(None, ge=0, le=70)
    price_min: float | None = Field(None, ge=0)
    price_max: float | None = Field(None, ge=0)
    currency: vocab.Currency = "USD"
    min_rating: float | None = Field(None, ge=0, le=5)
    free_trial: bool = False
    verified: bool = False


class SearchQuery(SearchFilters):
    sort: Literal["best", "price_asc", "price_desc", "rating", "experience", "response"] = "best"
    offset: int = Field(0, ge=0)
    limit: int = Field(20, ge=1, le=50)


def _fold(values) -> set[str]:
    return {v.strip().casefold() for v in values}


def _price_usd(p: TeacherProfile) -> float | None:
    return None if p.price is None else float(p.price) * vocab.CURRENCY_TO_USD[p.currency]


def _online(p: TeacherProfile) -> bool:
    return p.format in ("online", "both")


def _offline(p: TeacherProfile, city: str | None) -> bool:
    same_city = not city or (p.city or "").casefold() == city.strip().casefold()
    return p.format in ("offline", "both") and same_city


def _format_ok(p: TeacherProfile, st: Stats, f: SearchFilters) -> bool:
    if f.format == "online":
        return _online(p)
    if f.format == "offline":
        return _offline(p, f.city)
    return _online(p) or _offline(p, f.city)


def _price_ok(p: TeacherProfile, st: Stats, f: SearchFilters) -> bool:
    price = _price_usd(p)
    if price is None:
        return False
    rate = vocab.CURRENCY_TO_USD[f.currency]
    low = f.price_min * rate if f.price_min is not None else None
    high = f.price_max * rate if f.price_max is not None else None
    return (low is None or price >= low - 0.01) and (high is None or price <= high + 0.01)


def _language_ok(p: TeacherProfile, st: Stats, f: SearchFilters) -> bool:
    return f.language.strip().casefold() in _fold(item["language"] for item in p.languages)


# name -> (is the filter used?, does the teacher pass it?)
HARD_FILTERS: dict[str, tuple[Callable[[SearchFilters], bool], Callable[[TeacherProfile, Stats, SearchFilters], bool]]] = {
    "format": (lambda f: f.format is not None, _format_ok),
    "price": (lambda f: f.price_min is not None or f.price_max is not None, _price_ok),
    "language": (lambda f: bool(f.language), _language_ok),
    "lesson_type": (lambda f: f.lesson_type is not None, lambda p, st, f: f.lesson_type in p.lesson_types),
    "min_experience": (lambda f: bool(f.min_experience), lambda p, st, f: (p.experience_years or 0) >= f.min_experience),
    "min_rating": (lambda f: bool(f.min_rating), lambda p, st, f: st.rating is not None and st.rating >= f.min_rating),
    "free_trial": (lambda f: f.free_trial, lambda p, st, f: p.free_trial),
    "verified": (lambda f: f.verified, lambda p, st, f: p.is_verified),
}  # fmt: skip


def _times_ok(availability: list[str], times: list[str]) -> bool:
    parts = [t for t in times if t in vocab.DAY_PARTS] or vocab.DAY_PARTS
    days = (vocab.WEEKDAYS if "weekdays" in times else []) + (vocab.WEEKEND if "weekends" in times else [])
    return any(f"{day}_{part}" in availability for day in days or vocab.DAYS for part in parts)


def match_percent(p: TeacherProfile, f: SearchFilters) -> int:
    """Share of the soft criteria the teacher fits: topics, level, goal, age group, time."""
    points, total = 0.0, 0
    if f.topics:
        wanted = _fold(f.topics)
        total += 1
        points += len(wanted & _fold(p.topics)) / len(wanted)
    if f.level:
        total += 1
        points += f.level in p.levels
    if f.goal:
        total += 1
        points += f.goal in p.goals
    if f.for_whom:
        total += 1
        groups = {"kids", "teens"} if f.for_whom == "child" else {"adults"}
        points += bool(groups & set(p.age_groups))
    if f.times:
        total += 1
        points += _times_ok(p.availability, f.times)
    return 100 if total == 0 else round(100 * points / total)


def _failed_filters(p: TeacherProfile, st: Stats, f: SearchFilters) -> list[str]:
    return [name for name, (used, passes) in HARD_FILTERS.items() if used(f) and not passes(p, st, f)]


def published_teachers(session: Session, subject: str) -> list[tuple[TeacherProfile, User]]:
    """Approved, accepting new students, not blocked, and teaching `subject`."""
    rows = session.exec(
        select(TeacherProfile, User)
        .join(User, col(User.id) == TeacherProfile.user_id)
        .where(TeacherProfile.status == "approved", col(TeacherProfile.accepting_students).is_(True))
        .where(col(User.is_blocked).is_(False))
    ).all()
    subject = subject.strip().casefold()
    return [(p, u) for p, u in rows if subject in _fold(p.subjects)]


SORT_KEYS = {
    "best": lambda p, st, m: (-m, -(st.rating or 0), -st.reviews),
    "price_asc": lambda p, st, m: (_price_usd(p) or 0, -m),
    "price_desc": lambda p, st, m: (-(_price_usd(p) or 0), -m),
    "rating": lambda p, st, m: (-(st.rating or 0), -st.reviews, -m),
    "experience": lambda p, st, m: (-(p.experience_years or 0), -m),
    "response": lambda p, st, m: (st.response_hours or 999, -m),
}


def search(session: Session, q: SearchQuery) -> dict:
    rows = published_teachers(session, q.subject)
    stats = teacher_stats(session, [p for p, _ in rows])
    found, almost = [], {}
    for p, user in rows:
        failed = _failed_filters(p, stats[p.id], q)
        if not failed:
            found.append((p, user, match_percent(p, q)))
        elif len(failed) == 1:  # would be shown if this one filter were removed
            almost[failed[0]] = almost.get(failed[0], 0) + 1
    found.sort(key=lambda row: SORT_KEYS[q.sort](row[0], stats[row[0].id], row[2]))
    page = found[q.offset : q.offset + q.limit]
    relax = [] if found else [{"filter": k, "count": v} for k, v in sorted(almost.items(), key=lambda kv: -kv[1])]
    return {
        "total": len(found),
        "items": [teacher_card(p, user, stats[p.id], match) for p, user, match in page],
        "relax": relax,
    }


def profile_matches(session: Session, profile: TeacherProfile, filters: SearchFilters) -> bool:
    """Would this (just published) teacher appear for the saved search?"""
    if filters.subject.strip().casefold() not in _fold(profile.subjects) or not profile.accepting_students:
        return False
    stats = teacher_stats(session, [profile])[profile.id]
    return not _failed_filters(profile, stats, filters)
