"""Fields per subject: teacher answers per subject (offers), learner answers in requests (attrs)

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-29 10:00:00

The old profile had one list of levels, age groups, goals and topics for all subjects.
They are copied into a block per subject. Values are converted the way catalog.py stores them
at the time of writing (the mapping is frozen here on purpose); values a subject doesn't know
are dropped by the app on the next save.
"""
import json
import re
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op


revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Subjects that used CEFR levels (A1–C2) before this change.
CEFR_SUBJECTS = {"English", "Business English", "German", "Polish", "French", "Spanish", "Czech", "Slovak", "Italian", "Dutch"}
KNOWN = CEFR_SUBJECTS | {
    "IELTS", "Chinese", "Math", "Ukrainian", "History of Ukraine", "Ukrainian Literature", "Geography", "Biology",
    "Chemistry", "Physics", "Computer Science", "Primary School", "School Readiness", "Higher Math", "Python",
    "Excel & Google Sheets", "AI Tools", "Coding for Kids", "JavaScript", "Data Analytics", "Cybersecurity",
    "QA / Software Testing", "Computer Basics", "Graphic Design", "UI/UX Design", "Video Editing", "Guitar", "Piano",
    "Singing", "Drums", "Drawing", "Chess", "Photography", "Dance", "Speech Therapy", "Mental Arithmetic",
    "Robotics & STEM", "Digital Marketing", "Accounting", "Public Speaking",
}
ALIASES = {"maths": "Math", "mathematics": "Math"}
GOALS = {
    "Job interviews": "interviews", "Work": "work", "Travel": "travel", "Exam preparation": "exam",
    "Everyday conversation": "conversation", "School support": "school", "Relocation": "relocation", "Hobby": "hobby",
}


def _slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def _load(value):
    return json.loads(value) if isinstance(value, str) else (value or [])


def _offers(row) -> list[dict]:
    offers, seen = [], set()
    for name in _load(row["subjects"]):
        name = ALIASES.get(name.strip().casefold(), name.strip())
        match = next((k for k in KNOWN if k.casefold() == name.casefold()), None)
        if match is None or match in seen:
            continue
        seen.add(match)
        attrs = {
            "age": [a for a in _load(row["age_groups"]) if a in ("kids", "teens", "adults")],
            "goal": [GOALS[g] for g in _load(row["goals"]) if g in GOALS],
            "topics": [_slug(t) for t in _load(row["topics"])],
        }
        if match in CEFR_SUBJECTS:
            attrs["level"] = list(_load(row["levels"]))
        offers.append({"subject": match, "attrs": {k: v for k, v in attrs.items() if v}})
    return offers


def upgrade() -> None:
    op.add_column('teacher_profiles', sa.Column('offers', sa.JSON(), nullable=False, server_default='[]'))
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id, subjects, topics, levels, age_groups, goals FROM teacher_profiles')).mappings().all()
    for row in rows:
        offers = _offers(row)
        conn.execute(
            sa.text('UPDATE teacher_profiles SET offers = CAST(:offers AS JSON), subjects = CAST(:subjects AS JSON) WHERE id = :id'),
            {"offers": json.dumps(offers), "subjects": json.dumps([o["subject"] for o in offers]), "id": row["id"]},
        )
    for column in ('topics', 'levels', 'age_groups', 'goals'):
        op.drop_column('teacher_profiles', column)

    op.add_column('lesson_requests', sa.Column('attrs', sa.JSON(), nullable=False, server_default='{}'))
    op.alter_column('lesson_requests', 'level', type_=sqlmodel.sql.sqltypes.AutoString(length=60),
                    existing_type=sqlmodel.sql.sqltypes.AutoString(length=2), existing_nullable=True)
    op.alter_column('lesson_requests', 'goal', type_=sqlmodel.sql.sqltypes.AutoString(length=80),
                    existing_type=sqlmodel.sql.sqltypes.AutoString(length=40), existing_nullable=False)


def downgrade() -> None:
    op.execute("UPDATE lesson_requests SET level = NULL WHERE length(level) > 2")
    op.execute("UPDATE lesson_requests SET goal = left(goal, 40)")
    op.alter_column('lesson_requests', 'goal', type_=sqlmodel.sql.sqltypes.AutoString(length=40),
                    existing_type=sqlmodel.sql.sqltypes.AutoString(length=80), existing_nullable=False)
    op.alter_column('lesson_requests', 'level', type_=sqlmodel.sql.sqltypes.AutoString(length=2),
                    existing_type=sqlmodel.sql.sqltypes.AutoString(length=60), existing_nullable=True)
    op.drop_column('lesson_requests', 'attrs')
    for column in ('goals', 'age_groups', 'levels', 'topics'):
        op.add_column('teacher_profiles', sa.Column(column, sa.JSON(), nullable=False, server_default='[]'))
    op.drop_column('teacher_profiles', 'offers')
