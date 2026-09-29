"""Email notifications (HTML with a plain-text copy). Without SMTP settings they are written to the log instead.

Every email has one button that opens the right page (e.g. the chat), and a Brevo tag
(X-Mailin-tag) so the Brevo statistics show which kind of email it was.
"""
import html
import logging
import smtplib
from email.message import EmailMessage

from fastapi import BackgroundTasks

from . import config
from .models import User

log = logging.getLogger("lealink.email")


def page_url(link: str = "") -> str:
    """Full address of a site page, e.g. page_url("chat.html?id=3")."""
    return f"{config.site_url()}/{link.lstrip('/')}"


def _text(text: str, url: str, button: str) -> str:
    return (
        f"{text}\n\n{button}: {url}\n\n--\nYou get this email because you have a LeaLink account.\n"
        f"Change email notifications: {page_url('settings.html#notifications')}"
    )


def _html(text: str, url: str, button: str) -> str:
    paragraphs = "".join(
        f'<p style="margin:0 0 14px">{html.escape(p).replace(chr(10), "<br>")}</p>' for p in text.split("\n\n") if p
    )
    font = "font-family:Inter,Arial,Helvetica,sans-serif"
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E9E9E7;border-radius:8px">
<tr><td style="padding:24px 28px 4px;{font};font-size:20px;font-weight:700;color:#2A37B5">LeaLink</td></tr>
<tr><td style="padding:12px 28px 8px;{font};font-size:15px;line-height:22px;color:#37352F">{paragraphs}
<p style="margin:22px 0 8px"><a href="{html.escape(url)}" style="display:inline-block;background:#15803D;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">{html.escape(button)}</a></p></td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #E9E9E7;{font};font-size:12px;line-height:18px;color:#787774">
You get this email because you have a LeaLink account.
<a href="{html.escape(page_url('settings.html#notifications'))}" style="color:#787774">Change email notifications</a>.</td></tr>
</table></td></tr></table></body></html>"""


def build(to: str, subject: str, text: str, link: str = "", button: str = "Open LeaLink", tag: str = "") -> EmailMessage:
    url = page_url(link)
    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = f"LeaLink: {subject}"
    if tag:
        msg["X-Mailin-tag"] = tag  # Brevo: shown in the transactional logs and statistics
    msg.set_content(_text(text, url, button))
    msg.add_alternative(_html(text, url, button), subtype="html")
    return msg


def deliver(msg: EmailMessage) -> None:
    """Send one email through SMTP. Raises on errors (see `python -m app.cli send-test-email`).

    Port 465 uses SSL; any other port (587, 2525...) uses STARTTLS.
    """
    smtp_class = smtplib.SMTP_SSL if config.SMTP_PORT == 465 else smtplib.SMTP
    with smtp_class(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as smtp:
        if config.SMTP_PORT != 465:
            smtp.starttls()
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)


def send_email(to: str, subject: str, text: str, link: str = "", button: str = "Open LeaLink", tag: str = "") -> None:
    """Send a notification; errors are logged, never raised (the user's action already succeeded)."""
    msg = build(to, subject, text, link, button, tag)
    if not config.SMTP_HOST:
        log.info("Email (SMTP not configured) to %s: %s\n%s", to, subject, msg.get_body(("plain",)).get_content())
        return
    try:
        deliver(msg)
    except (OSError, smtplib.SMTPException):
        log.exception("Could not send email to %s", to)


def notify(
    background: BackgroundTasks, user: User, setting: str | None, subject: str, text: str,
    link: str = "", button: str = "Open LeaLink", tag: str = "",
) -> None:  # fmt: skip
    """Queue an email to `user` if they have `setting` (e.g. "notify_requests") turned on.

    setting=None means an account email that is always sent (e.g. profile moderation result).
    `link` is the page the button opens, relative to the site ("chat.html?id=3").
    """
    if user.is_blocked or (setting and not getattr(user, setting)):
        return
    background.add_task(send_email, user.email, subject, text, link, button, tag)
