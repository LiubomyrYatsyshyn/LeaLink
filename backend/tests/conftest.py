"""Tests run against a separate PostgreSQL database "lealink_test" on the same server.

    docker compose run --rm api sh -c "pip install -q -r requirements-dev.txt && python -m pytest"
"""
import os
import tempfile

from sqlalchemy import create_engine, make_url, text

# Configure the app before importing it.
_base = make_url(os.getenv("DATABASE_URL", "postgresql+psycopg://lealink:lealink@localhost:5432/lealink"))
TEST_URL = _base.set(database="lealink_test")
os.environ["DATABASE_URL"] = TEST_URL.render_as_string(hide_password=False)
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="lealink-test-")
os.environ["HOUSEKEEPING_INTERVAL"] = "0"
os.environ["SMTP_HOST"] = ""

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from app import emails  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PASSWORD = "test-password-1"

ENGLISH = {
    "level": ["A2", "B1", "B2"],
    "age": ["teens", "adults"],
    "goal": ["interviews", "travel"],
    "topics": ["speaking", "language_for_your_job"],
    "own_level": "C2",
}


def english(**changes) -> list[dict]:
    """The `offers` of an English teacher, with some answers changed."""
    return [{"subject": "English", "attrs": {**ENGLISH, **changes}}]


TEACHER = {
    "display_name": "Olena Kovalenko",
    "headline": "Conversational English for professionals and travellers",
    "about": "I'm an English teacher from Lviv, now living in Lisbon. " * 5,
    "country": "Portugal",
    "city": "Lisbon",
    "timezone": "Europe/Lisbon",
    "languages": [{"language": "English", "level": "C2"}, {"language": "Ukrainian", "level": "Native"}],
    "offers": english(),
    "experience_years": 7,
    "occupation": "Freelance English teacher",
    "format": "both",
    "offline_location": "Lisbon, Avenidas Novas",
    "travel_radius_km": 5,
    "lesson_types": ["individual"],
    "durations": [45, 60],
    "price": 22,
    "currency": "USD",
    "free_trial": True,
    "trial_minutes": 30,
    "availability": ["mon_evening", "tue_evening", "sat_morning"],
    "contact_method": "telegram",
    "contact_value": "@olena_english",
    "questions": ["What would you like to be able to do after 3 months?"],
}

MESSAGE = "Hi! I have job interviews in English next month and want to practise talking about my work."


def request_payload(teacher_id: int, **changes) -> dict:
    return {
        "teacher_id": teacher_id,
        "subject": "English",
        "attrs": {"level": "B1", "goal": "interviews", "topics": ["speaking"]},
        "lessons_per_week": 2,
        "lesson_duration": 60,
        "preferred_times": ["evening", "weekdays"],
        "format": "online",
        "budget_min": 15,
        "budget_max": 35,
        "currency": "USD",
        "free_trial": True,
        "message": MESSAGE,
        **changes,
    }


def _prepare_database() -> None:
    admin = create_engine(_base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        if not conn.execute(text("SELECT 1 FROM pg_database WHERE datname = 'lealink_test'")).first():
            conn.execute(text("CREATE DATABASE lealink_test"))
    admin.dispose()
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    # Build the schema with the real migrations, so they are tested too.
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    command.upgrade(cfg, "head")


_prepare_database()


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    tables = ", ".join(f'"{t.name}"' for t in SQLModel.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture(autouse=True)
def outbox(monkeypatch) -> list[tuple[str, str, str]]:
    """Emails "sent" during the test: (to, subject, text)."""
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(emails, "send_email", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


class Api:
    """Small helpers on top of the test client."""

    def __init__(self, client: TestClient):
        self.client = client
        self._n = 0

    def signup(self, name: str = "Anna Petrenko", **extra) -> dict:
        self._n += 1
        email = extra.pop("email", f"user{self._n}@example.com")
        r = self.client.post(
            "/api/auth/register", json={"full_name": name, "email": email, "password": PASSWORD, **extra}
        )
        assert r.status_code == 201, r.text
        data = r.json()
        return {"headers": {"Authorization": f"Bearer {data['access_token']}"}, **data["user"]}

    def admin(self) -> dict:
        user = self.signup("Moderator")
        with Session(engine) as session:
            session.get(User, user["id"]).is_admin = True
            session.commit()
        return user

    def teacher(self, admin: dict | None = None, name: str = "Olena Kovalenko", **profile) -> dict:
        """A teacher with a complete profile; published if `admin` is given."""
        user = self.signup(name)
        h = user["headers"]
        assert self.client.post("/api/auth/me/photo", headers=h, files={"file": ("me.png", PNG, "image/png")}).is_success
        r = self.client.put("/api/teacher/profile", headers=h, json={**TEACHER, "display_name": name, **profile})
        assert r.status_code == 200, r.text
        r = self.client.post("/api/teacher/profile/submit", headers=h)
        assert r.status_code == 200, r.text
        user["teacher_id"] = r.json()["id"]
        if admin:
            r = self.client.post(f"/api/admin/teachers/{user['teacher_id']}/approve", headers=admin["headers"], json={})
            assert r.status_code == 200, r.text
        return user

    def send_request(self, learner: dict, teacher: dict, **changes):
        return self.client.post(
            "/api/requests", headers=learner["headers"], json=request_payload(teacher["teacher_id"], **changes)
        )


@pytest.fixture
def api(client) -> Api:
    return Api(client)
