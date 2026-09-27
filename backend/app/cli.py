"""Admin commands. Run them in the api container:

    docker compose exec api python -m app.cli make-admin you@example.com
    docker compose exec api python -m app.cli seed-demo
"""
import argparse
import secrets
from decimal import Decimal

from sqlmodel import select

from .db import new_session
from .models import TeacherProfile, User, utcnow
from .security import hash_password


def make_admin(email: str, revoke: bool = False) -> None:
    with new_session() as session:
        user = session.exec(select(User).where(User.email == email.lower())).first()
        if user is None:
            raise SystemExit(f"No user with email {email}. Sign up on the site first.")
        user.is_admin = not revoke
        session.commit()
        print(f"{user.email} is {'no longer' if revoke else 'now'} a moderator")


DEMO_TEACHERS = [
    ("Olena Kovalenko", "Conversational English for professionals and travellers", ["English", "Business English"],
     ["Speaking", "Job interviews", "Business emails", "Pronunciation", "Travel"], 7, "both", "Lisbon", "Portugal", 22, True, True),
    ("Sophie Laurent", "IELTS Academic coach — a structured path to band 7.0+", ["IELTS", "English"],
     ["Writing", "Speaking"], 9, "online", "Paris", "France", 32, False, True),
    ("Mei Lin", "Clear pronunciation and fluency for confident speaking", ["English"],
     ["Pronunciation", "Speaking"], 5, "online", "Singapore", "Singapore", 26, True, False),
    ("Hannah Weber", "Business English, emails and job interview practice", ["English", "Business English"],
     ["Business emails", "Job interviews"], 6, "both", "Kyiv", "Ukraine", 27, True, True),
    ("James Okafor", "Relaxed English conversation for adults at any level", ["English"],
     ["Conversation", "Speaking"], 3, "online", "Lagos", "Nigeria", 18, True, False),
    ("Priya Nair", "Python and data analysis from zero to your first project", ["Python"],
     ["Data analysis", "Pandas", "Jupyter"], 6, "online", "Bengaluru", "India", 35, True, True),
]  # fmt: skip


def seed_demo() -> None:
    """Published demo teachers so that search shows results. They can't log in (random passwords)."""
    with new_session() as session:
        for name, headline, subjects, topics, years, fmt, city, country, price, trial, verified in DEMO_TEACHERS:
            email = name.lower().replace(" ", ".") + "@demo.lealink"
            if session.exec(select(User).where(User.email == email)).first():
                continue
            user = User(email=email, full_name=name, password_hash=hash_password(secrets.token_urlsafe(24)))
            session.add(user)
            session.flush()
            session.add(TeacherProfile(
                user_id=user.id, status="approved", is_verified=verified, display_name=name, headline=headline,
                about=f"{headline}. " * 8, country=country, city=city, timezone="UTC",
                languages=[{"language": "English", "level": "C2"}], subjects=subjects, topics=topics,
                levels=["A2", "B1", "B2", "C1"], age_groups=["teens", "adults"],
                goals=["Job interviews", "Work", "Travel", "Everyday conversation", "Exam preparation"],
                experience_years=years, occupation="Teacher", format=fmt,
                offline_location=city if fmt != "online" else None, travel_radius_km=5 if fmt != "online" else None,
                lesson_types=["individual"], durations=[45, 60], price=Decimal(price), currency="USD",
                free_trial=trial, trial_minutes=30 if trial else None,
                availability=[f"{d}_{p}" for d in ("mon", "tue", "wed", "thu", "fri") for p in ("afternoon", "evening")],
                contact_method="email", contact_value=email, submitted_at=utcnow(), published_at=utcnow(),
            ))  # fmt: skip
            print(f"Added {name}")
        session.commit()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("make-admin", help="Give a user moderator rights")
    admin.add_argument("email")
    admin.add_argument("--revoke", action="store_true", help="Take the rights away")
    commands.add_parser("seed-demo", help="Add published demo teachers (for local testing)")
    args = parser.parse_args()
    if args.command == "make-admin":
        make_admin(args.email, args.revoke)
    else:
        seed_demo()


if __name__ == "__main__":
    main()
