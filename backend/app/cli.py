"""Admin commands. Run them in the api container:

    docker compose exec api python -m app.cli make-admin you@example.com
    docker compose exec api python -m app.cli send-test-email you@example.com
    docker compose exec api python -m app.cli seed-demo
"""
import argparse
import secrets
import smtplib
from decimal import Decimal

from sqlmodel import select

from . import catalog, config, emails
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


def send_test_email(to: str) -> None:
    """Send one email right now and report the SMTP error, if any (notifications only log errors)."""
    if not config.SMTP_HOST:
        raise SystemExit("SMTP_HOST is not set, so emails only go to the log. See docs/DEPLOY.md (Email).")
    where = f"{config.SMTP_HOST}:{config.SMTP_PORT}"
    try:
        emails.deliver(emails.build(
            to, "Test email", "Email sending works. LeaLink will notify people about requests and messages.", tag="test",
        ))  # fmt: skip
    except smtplib.SMTPAuthenticationError as e:
        raise SystemExit(f"{where} rejected the login (SMTP_USER / SMTP_PASSWORD): {e.smtp_code} {e.smtp_error!r}") from None
    except smtplib.SMTPException as e:
        raise SystemExit(f"{where} refused the email: {e}") from None
    except OSError as e:
        raise SystemExit(f"Can't connect to {where}: {e}. Is the port blocked by the hosting?") from None
    print(f"Sent a test email to {to} via {where} (from {config.SMTP_FROM}). Check the inbox and the spam folder.")


ENGLISH = {
    "level": ["A2", "B1", "B2", "C1"], "age": ["teens", "adults"], "own_level": "C2",
    "goal": ["conversation", "work", "interviews", "exam", "travel"], "topics": ["speaking", "pronunciation", "business_language"],
    "explain": ["native", "target"], "exams": ["ielts"], "lang_cert": ["ielts"],
}  # fmt: skip
DEMO_TEACHERS = [
    ("Olena Kovalenko", "Conversational English for professionals and travellers",
     [("English", {**ENGLISH, "teaching_cert": ["celta"]}),
      ("Business English", {"level": ["B1", "B2", "C1"], "age": ["adults"], "own_level": "C2", "goal": ["work", "interviews"],
                            "topics": ["emails", "job_interviews", "presentations"], "industry": ["it"], "industry_exp": True})],
     7, "both", "Lisbon", "Portugal", 22, True, True),
    ("Sophie Laurent", "IELTS Academic coach — a structured path to band 7.0+",
     [("IELTS", {"level": ["b50", "b60", "b70"], "age": ["teens", "adults"], "goal": ["study_abroad", "migration"],
                 "topics": ["writing", "speaking"], "module": ["academic"], "own_band": "b85", "teaching_cert": ["celta"]}),
      ("English", ENGLISH)],
     9, "online", "Paris", "France", 32, False, True),
    ("Mei Lin", "Clear pronunciation and fluency for confident speaking",
     [("English", {**ENGLISH, "level": ["A1", "A2", "B1"], "own_level": "C1", "topics": ["pronunciation", "speaking"]})],
     5, "online", "Singapore", "Singapore", 26, True, False),
    ("Hannah Weber", "English and German for work, emails and job interviews",
     [("English", {**ENGLISH, "goal": ["work", "interviews", "nmt"], "nmt_best": "190", "nmt_start": ["mid", "strong"]}),
      ("German", {"level": ["A1", "A2", "B1", "B2"], "age": ["teens", "adults"], "own_level": "native",
                  "goal": ["relocation", "work", "exam"], "topics": ["speaking", "grammar"], "exams": ["goethe_zertifikat"]})],
     6, "both", "Kyiv", "Ukraine", 27, True, True),
    ("James Okafor", "Relaxed English conversation for adults at any level",
     [("English", {**ENGLISH, "level": ["A1", "A2", "B1", "B2"], "age": ["adults"], "goal": ["conversation", "travel"],
                   "topics": ["speaking"], "exams": []})],
     3, "online", "Lagos", "Nigeria", 18, True, False),
    ("Priya Nair", "Python and data analysis from zero to your first project",
     [("Python", {"level": ["complete_beginner", "beginner", "intermediate"], "age": ["teens", "adults"],
                  "goal": ["first_job", "switch", "project"], "topics": ["basics", "data_pandas_numpy"], "grade": "senior",
                  "work_years": "5", "mentoring": True}),
      ("Data Analytics", {"level": ["complete_beginner", "beginner"], "age": ["adults"], "goal": ["switch", "first_job"],
                          "topics": ["sql", "python_pandas", "power_bi"], "grade": "senior", "work_years": "5"})],
     6, "online", "Bengaluru", "India", 35, True, True),
    ("Andrii Melnyk", "Math for grades 5–11 and NMT: my students score 190–200",
     [("Math", {"level": ["g7", "g8", "g9", "g10", "g11", "graduate"], "goal": ["grades", "nmt", "olympiad"],
                "topics": ["equations_and_inequalities", "functions_and_graphs", "plane_geometry", "trigonometry"],
                "program": ["standard", "advanced"], "curriculum": ["ua"], "ped_degree": True, "school_exp": "higher",
                "olympiad_exp": "regional", "nmt_best": "200", "nmt_start": ["mid", "strong"], "nmt_own": "200",
                "nmt_years": "10", "nmt_format": ["full_course_6_9_months", "mock_tests_with_review"]})],
     14, "both", "Kyiv", "Ukraine", 20, True, True),
    ("Taras Bondar", "Acoustic and electric guitar from the first chord to your own songs",
     [("Guitar", {"level": ["complete_beginner", "beginner", "intermediate"], "age": ["kids", "teens", "adults"],
                  "goal": ["self", "band", "songs"], "topics": ["chords_and_tabs", "technique", "playing_by_ear"],
                  "kind": ["acoustic", "electric"], "styles": ["pop_and_accompaniment", "rock", "blues"],
                  "music_edu": "college", "stage": ["concerts", "band"]})],
     8, "both", "Lviv", "Ukraine", 15, True, False),
    ("Iryna Savchuk", "Speech therapist for children 3–10: sounds, speech delay, stuttering",
     [("Speech Therapy", {"age": ["age_3_5", "age_6_7", "age_8_10"], "area": ["sound_production", "delay", "stuttering"],
                          "assessment": True, "diploma": True})],
     11, "online", "Dnipro", "Ukraine", 18, False, True),
]  # fmt: skip


def seed_demo() -> None:
    """Published demo teachers so that search shows results. They can't log in (random passwords)."""
    with new_session() as session:
        for name, headline, offers, years, fmt, city, country, price, trial, verified in DEMO_TEACHERS:
            email = name.lower().replace(" ", ".") + "@demo.lealink"
            if session.exec(select(User).where(User.email == email)).first():
                continue
            user = User(email=email, full_name=name, password_hash=hash_password(secrets.token_urlsafe(24)))
            session.add(user)
            session.flush()
            offers = [{"subject": s, "attrs": catalog.clean_teacher(catalog.get(s), attrs)} for s, attrs in offers]
            session.add(TeacherProfile(
                user_id=user.id, status="approved", is_verified=verified, display_name=name, headline=headline,
                about=f"{headline}. " * 8, country=country, city=city, timezone="UTC",
                languages=[{"language": "English", "level": "C2"}, {"language": "Ukrainian", "level": "Native"}],
                offers=offers, subjects=[o["subject"] for o in offers],
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
    test = commands.add_parser("send-test-email", help="Check the SMTP settings by sending one email")
    test.add_argument("email")
    commands.add_parser("seed-demo", help="Add published demo teachers (for local testing)")
    args = parser.parse_args()
    if args.command == "make-admin":
        make_admin(args.email, args.revoke)
    elif args.command == "send-test-email":
        send_test_email(args.email)
    else:
        seed_demo()


if __name__ == "__main__":
    main()
