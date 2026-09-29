"""Settings, read from environment variables (see docker-compose.yml)."""
import os
import secrets
from functools import lru_cache
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://lealink:lealink@localhost:5432/lealink")

# Uploaded files and the generated secret key live here (a Docker volume on the server).
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
UPLOAD_DIR = DATA_DIR / "uploads"  # public: profile photos, served at /api/uploads/
PRIVATE_DIR = DATA_DIR / "private"  # certificates: only the owner and admins can download them

TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", str(24 * 7)))

# Business rules from the MVP.
REQUEST_TTL_HOURS = 72  # a teacher has 72 hours to accept or decline
REQUEST_LIMIT = 5  # max pending requests per learner
EXPIRY_WARNING_HOURS = 12  # email the learner 12 hours before a request expires
REVIEW_EDIT_DAYS = 14  # a review can be edited within 14 days

# How often expired requests are closed and reminders sent (seconds, 0 = off).
HOUSEKEEPING_INTERVAL = int(os.getenv("HOUSEKEEPING_INTERVAL", "60"))

# Email. Without SMTP_HOST emails are only written to the log.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM") or "LeaLink <no-reply@lealink.local>"

# Comma-separated origins allowed to call the API from another domain (not needed behind Caddy).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]


def site_url() -> str:
    """Public address of the site, used for links in emails: SITE_URL, else the main domain (SITE_DOMAIN),
    else the first host in SITE_ADDRESS."""
    if os.getenv("SITE_URL"):
        return os.environ["SITE_URL"].rstrip("/")
    if os.getenv("SITE_DOMAIN"):
        return "https://" + os.environ["SITE_DOMAIN"].strip()
    host = os.getenv("SITE_ADDRESS", "").split(",")[0].strip()
    if host and not host.startswith(":"):
        return host if host.startswith("http") else f"https://{host}"
    return "http://localhost"


@lru_cache
def secret_key() -> str:
    """SECRET_KEY from the environment, or a random key generated once and kept in DATA_DIR."""
    if os.getenv("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    path = DATA_DIR / "secret_key"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_urlsafe(48))
        path.chmod(0o600)
    return path.read_text().strip()
