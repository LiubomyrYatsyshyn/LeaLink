import smtplib

import pytest

from app import cli, config, emails

REAL_SEND_EMAIL = emails.send_email  # the autouse `outbox` fixture replaces it during tests


class FakeSMTP:
    """Records what the app does with the SMTP connection."""

    instances: list["FakeSMTP"] = []

    def __init__(self, host, port, timeout=None):
        self.calls = [("connect", host, port)]
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.calls.append(("quit",))

    def starttls(self):
        self.calls.append(("starttls",))

    def login(self, user, password):
        if password == "wrong":
            raise smtplib.SMTPAuthenticationError(535, b"Authentication failed")
        self.calls.append(("login", user))

    def send_message(self, msg):
        self.calls.append(("send", msg))


@pytest.fixture
def smtp(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(config, "SMTP_HOST", "smtp-relay.brevo.com")
    monkeypatch.setattr(config, "SMTP_PORT", 2525)
    monkeypatch.setattr(config, "SMTP_USER", "login@smtp-brevo.com")
    monkeypatch.setattr(config, "SMTP_PASSWORD", "key")
    monkeypatch.setattr(config, "SMTP_FROM", "LeaLink <sender@example.com>")
    return FakeSMTP


def test_deliver_uses_starttls_on_port_2525(smtp, monkeypatch):
    monkeypatch.setenv("SITE_DOMAIN", "lealink.example")
    msg = emails.build("anna@example.com", "Hello", "Body <b>text</b>", link="chat.html?id=3", button="Open chat", tag="new-message")
    emails.deliver(msg)
    calls = smtp.instances[0].calls
    assert calls[0] == ("connect", "smtp-relay.brevo.com", 2525)
    assert calls[1:3] == [("starttls",), ("login", "login@smtp-brevo.com")]
    sent = calls[3][1]
    assert (sent["From"], sent["To"], sent["Subject"]) == ("LeaLink <sender@example.com>", "anna@example.com", "LeaLink: Hello")
    assert sent["X-Mailin-tag"] == "new-message"
    plain = sent.get_body(("plain",)).get_content()
    page = sent.get_body(("html",)).get_content()
    assert "Open chat: https://lealink.example/chat.html?id=3" in plain
    assert 'href="https://lealink.example/chat.html?id=3"' in page
    assert "Body &lt;b&gt;text&lt;/b&gt;" in page  # user text is escaped in HTML
    assert "https://lealink.example/settings.html#notifications" in plain


def test_send_email_logs_errors_instead_of_raising(smtp, monkeypatch, caplog):
    monkeypatch.setattr(config, "SMTP_PASSWORD", "wrong")
    REAL_SEND_EMAIL("anna@example.com", "Hello", "Body")  # must not raise
    assert "Could not send email to anna@example.com" in caplog.text


def test_cli_send_test_email(smtp, monkeypatch, capsys):
    cli.send_test_email("me@example.com")
    assert "Sent a test email to me@example.com" in capsys.readouterr().out
    monkeypatch.setattr(config, "SMTP_PASSWORD", "wrong")
    with pytest.raises(SystemExit, match="rejected the login"):
        cli.send_test_email("me@example.com")
    monkeypatch.setattr(config, "SMTP_HOST", "")
    with pytest.raises(SystemExit, match="SMTP_HOST is not set"):
        cli.send_test_email("me@example.com")
