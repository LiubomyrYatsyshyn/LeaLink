"""Email notifications. Without SMTP settings the emails are written to the log instead."""
import logging
import smtplib
from email.message import EmailMessage

from fastapi import BackgroundTasks

from . import config
from .models import User

log = logging.getLogger("lealink.email")


def _body(text: str) -> str:
    return f"{text}\n\nOpen LeaLink: {config.site_url()}\n\nYou can change email notifications in Account settings."


def deliver(to: str, subject: str, text: str) -> None:
    """Send one email through SMTP. Raises on errors (see `python -m app.cli send-test-email`).

    Port 465 uses SSL; any other port (587, 2525...) uses STARTTLS.
    """
    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = f"LeaLink: {subject}"
    msg.set_content(_body(text))
    smtp_class = smtplib.SMTP_SSL if config.SMTP_PORT == 465 else smtplib.SMTP
    with smtp_class(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as smtp:
        if config.SMTP_PORT != 465:
            smtp.starttls()
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)


def send_email(to: str, subject: str, text: str) -> None:
    """Send a notification; errors are logged, never raised (the user's action already succeeded)."""
    if not config.SMTP_HOST:
        log.info("Email (SMTP not configured) to %s: %s\n%s", to, subject, _body(text))
        return
    try:
        deliver(to, subject, text)
    except (OSError, smtplib.SMTPException):
        log.exception("Could not send email to %s", to)


def notify(background: BackgroundTasks, user: User, setting: str | None, subject: str, text: str) -> None:
    """Queue an email to `user` if they have `setting` (e.g. "notify_requests") turned on.

    setting=None means an account email that is always sent (e.g. profile moderation result).
    """
    if user.is_blocked or (setting and not getattr(user, setting)):
        return
    background.add_task(send_email, user.email, subject, text)
