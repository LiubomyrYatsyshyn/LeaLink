"""API input and output shapes."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints, model_validator

from . import vocab


def _valid_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Unknown time zone, use a name like Europe/Kyiv") from None
    return value


def _valid_slot(value: str) -> str:
    if value not in vocab.AVAILABILITY_SLOTS:
        raise ValueError("Use slots like mon_morning, tue_afternoon, sun_evening")
    return value


Text40 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Text100 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
TimeZone = Annotated[str, AfterValidator(_valid_timezone)]
Slot = Annotated[str, AfterValidator(_valid_slot)]
Price = Annotated[Decimal, Field(gt=0, le=100000, max_digits=10, decimal_places=2)]


# ---------- Users and auth ----------

class RegisterIn(BaseModel):
    full_name: Text100
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    timezone: TimeZone = "UTC"
    notify_requests: bool = True


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SettingsIn(BaseModel):
    """Account settings. Send only the fields you change."""

    full_name: Text100 | None = None
    email: EmailStr | None = None
    timezone: TimeZone | None = None
    country: Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)] | None = None
    notify_requests: bool | None = None
    notify_messages: bool | None = None
    notify_expiring: bool | None = None
    notify_matching: bool | None = None


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    photo_url: str | None
    timezone: str
    country: str | None
    is_admin: bool
    notify_requests: bool
    notify_messages: bool
    notify_expiring: bool
    notify_matching: bool
    password_changed_at: datetime
    created_at: datetime
    teacher_id: int | None = Field(description="Teacher profile id, if the user has one")
    teacher_status: str | None = Field(description="draft | pending | approved | rejected")


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class Person(BaseModel):
    id: int
    name: str
    photo_url: str | None


# ---------- Teacher profile ----------

class LanguageIn(BaseModel):
    language: Text40
    level: vocab.LanguageLevel


class EducationIn(BaseModel):
    institution: Text100
    degree: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""


class TeacherProfileIn(BaseModel):
    """Wizard data. Drafts may be incomplete: send any subset of fields, the rest stays as it was."""

    # 1. Basics
    display_name: Text100 | None = None
    headline: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    about: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
    country: Text40 | None = None
    city: Text40 | None = None
    timezone: TimeZone | None = None
    languages: list[LanguageIn] | None = Field(None, max_length=10)
    video_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None
    # 2. Subjects
    subjects: list[Text40] | None = Field(None, max_length=3)
    topics: list[Text40] | None = Field(None, max_length=20)
    levels: list[vocab.Level] | None = None
    age_groups: list[vocab.AgeGroup] | None = None
    goals: list[vocab.Goal] | None = None
    # 3. Experience
    experience_years: int | None = Field(None, ge=0, le=70)
    occupation: Text100 | None = None
    practical_experience: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    education: list[EducationIn] | None = Field(None, max_length=5)
    links: list[Text200] | None = Field(None, max_length=5)
    # 4. Format
    format: vocab.Format | None = None
    offline_location: Text100 | None = None
    travel_radius_km: int | None = Field(None, ge=1, le=100)
    lesson_types: list[vocab.LessonType] | None = None
    durations: list[vocab.Duration] | None = None
    platforms: list[Text40] | None = Field(None, max_length=10)
    max_group_size: int | None = Field(None, ge=2, le=50)
    # 5. Price & availability
    price: Price | None = None
    currency: vocab.Currency | None = None
    free_trial: bool | None = None
    trial_minutes: vocab.TrialMinutes | None = None
    availability: list[Slot] | None = None
    accepting_students: bool | None = None
    group_price: Price | None = None
    min_commitment: int | None = Field(None, ge=1, le=100)
    package_size: int | None = Field(None, ge=2, le=100)
    package_discount: int | None = Field(None, ge=1, le=90)
    # 6. Requests
    contact_method: vocab.ContactMethod | None = None
    contact_value: Text100 | None = None
    questions: list[Text200] | None = Field(None, max_length=3)
    response_time_hours: vocab.ResponseHours | None = None


class CertificateOut(BaseModel):
    id: int
    title: str
    content_type: str
    size: int
    created_at: datetime
    file_url: str | None = Field(None, description="Only for the owner and moderators")


class TeacherCard(BaseModel):
    """A teacher in search results."""

    id: int
    user_id: int
    display_name: str | None
    photo_url: str | None
    headline: str | None
    subjects: list[str]
    topics: list[str]
    is_verified: bool
    free_trial: bool
    trial_minutes: int | None
    rating: float | None
    reviews_count: int
    experience_years: int | None
    format: str | None
    city: str | None
    country: str | None
    price: float | None
    currency: str
    response_hours: int | None = Field(description="Average reply time, or the time the teacher promised")
    accepting_students: bool
    match: int | None = Field(None, description="Match % with the search filters")


class TeacherPublic(TeacherCard):
    """The teacher page as learners see it (no contact details)."""

    about: str | None
    languages: list[dict]
    video_url: str | None
    timezone: str | None
    levels: list[str]
    age_groups: list[str]
    goals: list[str]
    occupation: str | None
    practical_experience: str | None
    education: list[dict]
    links: list[str]
    certificates: list[CertificateOut]
    offline_location: str | None
    travel_radius_km: int | None
    lesson_types: list[str]
    durations: list[int]
    platforms: list[str]
    max_group_size: int | None
    group_price: float | None
    min_commitment: int | None
    package_size: int | None
    package_discount: int | None
    availability: list[str]
    questions: list[str]
    response_time_hours: int
    published_at: datetime | None


class TeacherProfileOut(TeacherPublic):
    """The teacher's own profile (with status and contact details)."""

    status: str
    review_note: str | None
    contact_method: str | None
    contact_value: str | None
    completeness: int = Field(description="Profile completeness, %")
    missing: list[str] = Field(description="Required fields still empty (submit is blocked until fixed)")
    submitted_at: datetime | None
    updated_at: datetime


class RelaxOption(BaseModel):
    filter: str = Field(description="Filter to remove: format, price, language, lesson_type, ...")
    count: int = Field(description="Teachers you would see without this filter")


class SearchResult(BaseModel):
    total: int
    items: list[TeacherCard]
    relax: list[RelaxOption] = Field(description="Filled only when nothing was found")


# ---------- Requests ----------

class AnswerIn(BaseModel):
    question: Text200
    answer: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class RequestIn(BaseModel):
    teacher_id: int
    for_whom: vocab.ForWhom = "myself"
    child_age: int | None = Field(None, ge=3, le=17)
    parent_contact: Text100 | None = None
    subject: Text40
    topics: list[Text40] = Field([], max_length=10)
    level: vocab.Level | None = None
    goal: vocab.Goal
    goal_details: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    lessons_per_week: int = Field(ge=1, le=7)
    lesson_duration: vocab.Duration
    preferred_times: list[vocab.TimePref] = Field(min_length=1)
    start_asap: bool = True
    start_date: date | None = None
    planned_duration: Text40 | None = None
    format: vocab.Format = "online"
    budget_min: Decimal | None = Field(None, ge=0, max_digits=10, decimal_places=2)
    budget_max: Decimal | None = Field(None, ge=0, max_digits=10, decimal_places=2)
    currency: vocab.Currency = "USD"
    free_trial: bool = False
    answers: list[AnswerIn] = Field([], max_length=3)
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=50, max_length=2000)]

    @model_validator(mode="after")
    def check(self) -> "RequestIn":
        if self.for_whom == "child" and (self.child_age is None or not self.parent_contact):
            raise ValueError("Child's age and parent contact are required for a child")
        if not set(self.preferred_times) & set(vocab.DAY_PARTS):
            raise ValueError("Choose at least one time of day in preferred_times")
        if not self.start_asap and not self.start_date:
            raise ValueError("Pick a start date or set start_asap")
        if self.budget_min is not None and self.budget_max is not None and self.budget_min > self.budget_max:
            raise ValueError("budget_min is greater than budget_max")
        return self


class DeclineIn(BaseModel):
    reason: vocab.DeclineReason
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=1000)]


class ReviewOut(BaseModel):
    id: int
    request_id: int
    author: Person
    author_role: str
    rating: int
    text: str
    subject: str
    level: str | None
    created_at: datetime
    updated_at: datetime


class Contact(BaseModel):
    method: str | None
    value: str | None


class RequestTeacher(Person):
    user_id: int


class RequestOut(BaseModel):
    id: int
    status: str = Field(description="pending | accepted | declined | withdrawn | expired | closed")
    my_role: Literal["learner", "teacher"]
    teacher: RequestTeacher
    learner: Person
    for_whom: str
    child_age: int | None
    parent_contact: str | None = Field(description="Shown to the teacher after accepting")
    subject: str
    topics: list[str]
    level: str | None
    goal: str
    goal_details: str | None
    lessons_per_week: int
    lesson_duration: int
    preferred_times: list[str]
    start_asap: bool
    start_date: date | None
    planned_duration: str | None
    format: str
    budget_min: float | None
    budget_max: float | None
    currency: str
    free_trial: bool
    answers: list[dict]
    message: str
    decline_reason: str | None
    decline_note: str | None
    created_at: datetime
    expires_at: datetime
    hours_left: int | None = Field(description="While pending: hours until the request expires")
    answered_at: datetime | None
    finished_at: datetime | None
    teacher_contact: Contact | None = Field(description="Opens after the teacher accepts")
    learner_started: bool
    teacher_started: bool
    lessons_started: bool = Field(description="Both confirmed 'We started lessons' — reviews are open")
    can_review: bool
    my_review: ReviewOut | None
    learner_rating: float | None = Field(None, description="For the teacher: how other teachers rated this learner")
    learner_reviews_count: int = 0


class SentRequests(BaseModel):
    active: int = Field(description="Pending requests that count toward the limit")
    limit: int
    items: list[RequestOut]


# ---------- Chats ----------

class MessageIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class MessageOut(BaseModel):
    id: int
    sender_id: int
    mine: bool
    text: str
    created_at: datetime


class ChatSummary(BaseModel):
    request_id: int
    my_role: Literal["learner", "teacher"]
    other: Person
    subject: str
    status: str
    answered_at: datetime | None
    last_message: MessageOut | None
    unread: int


class ChatOut(BaseModel):
    request: RequestOut
    messages: list[MessageOut]


# ---------- Reports and moderation ----------

class ReportIn(BaseModel):
    """Report a teacher profile (teacher_id) or the other person in a chat (request_id)."""

    teacher_id: int | None = None
    request_id: int | None = None
    reason: Text100
    details: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None

    @model_validator(mode="after")
    def one_target(self) -> "ReportIn":
        if (self.teacher_id is None) == (self.request_id is None):
            raise ValueError("Send either teacher_id or request_id")
        return self


class ReportOut(BaseModel):
    id: int
    reporter: Person
    reported: Person
    teacher_id: int | None
    request_id: int | None
    reason: str
    details: str | None
    status: str
    admin_note: str | None
    created_at: datetime
    resolved_at: datetime | None


class ApproveIn(BaseModel):
    verified: bool = Field(False, description="Give the Verified badge (certificates checked)")


class RejectIn(BaseModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]


class ResolveIn(BaseModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class AdminUserOut(BaseModel):
    id: int
    email: str
    full_name: str
    is_admin: bool
    is_blocked: bool
    teacher_id: int | None
    teacher_status: str | None
    created_at: datetime


class AlertOut(BaseModel):
    id: int
    filters: dict
    is_active: bool
    created_at: datetime
    notified_at: datetime | None
