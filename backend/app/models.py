"""Database tables. Lists (subjects, topics, availability...) are JSON columns to keep the schema small."""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, DateTime, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def Timestamp(**kwargs: Any) -> Any:
    """Timezone-aware timestamp column."""
    return Field(sa_type=DateTime(timezone=True), **kwargs)


def JsonList() -> Any:
    return Field(default_factory=list, sa_type=JSON)


def Money() -> Any:
    return Field(default=None, max_digits=10, decimal_places=2)


class User(SQLModel, table=True):
    """Everyone is a user. A user becomes a teacher by creating a TeacherProfile."""

    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(max_length=254, unique=True, index=True)
    full_name: str = Field(max_length=100)
    password_hash: str = Field(max_length=255)
    photo: str | None = Field(default=None, max_length=64)  # file name in UPLOAD_DIR
    timezone: str = Field(default="UTC", max_length=64)
    country: str | None = Field(default=None, max_length=64)
    is_admin: bool = False  # moderators: review teacher profiles and reports
    is_blocked: bool = False
    # Email notifications (Account settings).
    notify_requests: bool = True  # new request, accepted, declined, lessons started
    notify_messages: bool = True  # new chat message
    notify_expiring: bool = True  # my request expires in 12 hours
    notify_matching: bool = True  # a teacher for my saved search ("Notify me") joined
    password_changed_at: datetime = Timestamp(default_factory=utcnow)
    created_at: datetime = Timestamp(default_factory=utcnow)


class TeacherProfile(SQLModel, table=True):
    """The teacher questionnaire (wizard steps 1–6). Learners see it only after moderation."""

    __tablename__ = "teacher_profiles"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True)
    status: str = Field(default="draft", max_length=16, index=True)  # draft|pending|approved|rejected
    review_note: str | None = Field(default=None, max_length=1000)  # why a moderator rejected it
    is_verified: bool = False  # set by a moderator after checking certificates
    accepting_students: bool = True

    # 1. Basics
    display_name: str | None = Field(default=None, max_length=100)
    headline: str | None = Field(default=None, max_length=80)
    about: str | None = Field(default=None, max_length=1000)
    country: str | None = Field(default=None, max_length=64)
    city: str | None = Field(default=None, max_length=64)
    timezone: str | None = Field(default=None, max_length=64)
    languages: list[dict] = JsonList()  # [{"language": "English", "level": "C2"}]
    video_url: str | None = Field(default=None, max_length=300)

    # 2. Subjects
    subjects: list[str] = JsonList()
    topics: list[str] = JsonList()
    levels: list[str] = JsonList()
    age_groups: list[str] = JsonList()
    goals: list[str] = JsonList()

    # 3. Experience
    experience_years: int | None = None
    occupation: str | None = Field(default=None, max_length=100)
    practical_experience: str | None = Field(default=None, max_length=500)
    education: list[dict] = JsonList()  # [{"institution": "...", "degree": "..."}]
    links: list[str] = JsonList()

    # 4. Format
    format: str | None = Field(default=None, max_length=8)  # online|offline|both
    offline_location: str | None = Field(default=None, max_length=100)
    travel_radius_km: int | None = None
    lesson_types: list[str] = JsonList()
    durations: list[int] = JsonList()
    platforms: list[str] = JsonList()
    max_group_size: int | None = None

    # 5. Price & availability
    price: Decimal | None = Money()
    currency: str = Field(default="USD", max_length=3)
    free_trial: bool = False
    trial_minutes: int | None = None
    availability: list[str] = JsonList()  # ["mon_morning", "tue_evening", ...]
    group_price: Decimal | None = Money()
    min_commitment: int | None = None  # lessons
    package_size: int | None = None  # lessons
    package_discount: int | None = None  # percent

    # 6. Requests
    contact_method: str | None = Field(default=None, max_length=16)  # hidden until a request is accepted
    contact_value: str | None = Field(default=None, max_length=100)
    questions: list[str] = JsonList()
    response_time_hours: int = 24

    created_at: datetime = Timestamp(default_factory=utcnow)
    updated_at: datetime = Timestamp(default_factory=utcnow)
    submitted_at: datetime | None = Timestamp(default=None)
    published_at: datetime | None = Timestamp(default=None)


class Certificate(SQLModel, table=True):
    __tablename__ = "certificates"

    id: int | None = Field(default=None, primary_key=True)
    teacher_id: int = Field(foreign_key="teacher_profiles.id", index=True)
    title: str = Field(max_length=120)
    file_name: str = Field(max_length=64)  # in PRIVATE_DIR
    content_type: str = Field(max_length=64)
    size: int
    created_at: datetime = Timestamp(default_factory=utcnow)


class LessonRequest(SQLModel, table=True):
    """A learner's request to a teacher. After it is accepted it is also the chat between them."""

    __tablename__ = "lesson_requests"

    id: int | None = Field(default=None, primary_key=True)
    learner_id: int = Field(foreign_key="users.id", index=True)
    teacher_id: int = Field(foreign_key="teacher_profiles.id", index=True)
    # pending -> accepted | declined | withdrawn | expired; accepted -> closed (teacher ended it)
    status: str = Field(default="pending", max_length=16, index=True)

    for_whom: str = Field(default="myself", max_length=8)  # myself|child
    child_age: int | None = None
    parent_contact: str | None = Field(default=None, max_length=100)
    subject: str = Field(max_length=40)
    topics: list[str] = JsonList()
    level: str | None = Field(default=None, max_length=2)
    goal: str = Field(max_length=40)
    goal_details: str | None = Field(default=None, max_length=500)
    lessons_per_week: int
    lesson_duration: int
    preferred_times: list[str] = JsonList()
    start_asap: bool = True
    start_date: date | None = None
    planned_duration: str | None = Field(default=None, max_length=40)
    format: str = Field(default="online", max_length=8)
    budget_min: Decimal | None = Money()
    budget_max: Decimal | None = Money()
    currency: str = Field(default="USD", max_length=3)
    free_trial: bool = False
    answers: list[dict] = JsonList()  # [{"question": "...", "answer": "..."}]
    message: str = Field(max_length=2000)

    decline_reason: str | None = Field(default=None, max_length=64)
    decline_note: str | None = Field(default=None, max_length=300)

    created_at: datetime = Timestamp(default_factory=utcnow)
    expires_at: datetime = Timestamp()
    answered_at: datetime | None = Timestamp(default=None)  # accepted or declined
    finished_at: datetime | None = Timestamp(default=None)  # withdrawn, expired or closed
    expiry_warning_sent: bool = False

    # "We started lessons" — reviews open when both sides confirmed.
    learner_started_at: datetime | None = Timestamp(default=None)
    teacher_started_at: datetime | None = Timestamp(default=None)

    # Last message each side has seen (for unread counters).
    learner_last_read_id: int = 0
    teacher_last_read_id: int = 0


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: int | None = Field(default=None, primary_key=True)
    request_id: int = Field(foreign_key="lesson_requests.id", index=True)
    sender_id: int = Field(foreign_key="users.id")
    text: str = Field(max_length=2000)
    created_at: datetime = Timestamp(default_factory=utcnow)


class Review(SQLModel, table=True):
    """A learner reviews the teacher, a teacher reviews the learner — once per request."""

    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("request_id", "author_id"),)

    id: int | None = Field(default=None, primary_key=True)
    request_id: int = Field(foreign_key="lesson_requests.id", index=True)
    author_id: int = Field(foreign_key="users.id")
    target_id: int = Field(foreign_key="users.id", index=True)
    author_role: str = Field(max_length=8)  # learner (review of a teacher) | teacher (review of a learner)
    rating: int
    text: str = Field(max_length=1000)
    created_at: datetime = Timestamp(default_factory=utcnow)
    updated_at: datetime = Timestamp(default_factory=utcnow)


class Report(SQLModel, table=True):
    """A complaint from "Report this profile" or the Report button in chat. Moderators resolve it."""

    __tablename__ = "reports"

    id: int | None = Field(default=None, primary_key=True)
    reporter_id: int = Field(foreign_key="users.id")
    reported_user_id: int = Field(foreign_key="users.id", index=True)
    teacher_id: int | None = Field(default=None, foreign_key="teacher_profiles.id")
    request_id: int | None = Field(default=None, foreign_key="lesson_requests.id")
    reason: str = Field(max_length=100)
    details: str | None = Field(default=None, max_length=1000)
    status: str = Field(default="open", max_length=8, index=True)  # open|resolved
    admin_note: str | None = Field(default=None, max_length=1000)
    created_at: datetime = Timestamp(default_factory=utcnow)
    resolved_at: datetime | None = Timestamp(default=None)


class SearchAlert(SQLModel, table=True):
    """Saved search ("Notify me" on an empty result): email the learner once a matching teacher is published."""

    __tablename__ = "search_alerts"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    filters: dict = Field(default_factory=dict, sa_type=JSON)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Timestamp(default_factory=utcnow)
    notified_at: datetime | None = Timestamp(default=None)
