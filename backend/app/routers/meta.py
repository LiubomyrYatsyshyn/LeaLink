"""Health check and the option lists for the frontend forms."""
from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from sqlmodel import col, select

from .. import catalog, config, vocab
from ..models import TeacherProfile, User
from ..security import SessionDep

router = APIRouter(tags=["Meta"])


@router.get("/health")
def health(session: SessionDep) -> dict:
    session.exec(select(1)).one()
    return {"status": "ok"}


@router.get("/meta")
def meta() -> dict:
    """Option lists for selects and chips, plus the platform rules (request limit, reply time).

    `catalog`: the subjects grouped by category, and the fields each subject asks the teacher and the learner.
    """
    return {
        **vocab.options(),
        "subjects": catalog.NAMES,
        "catalog": catalog.meta(),
        "request_limit": config.REQUEST_LIMIT,
        "request_ttl_hours": config.REQUEST_TTL_HOURS,
        "review_edit_days": config.REVIEW_EDIT_DAYS,
    }


# Public pages for search engines. Teacher pages are added from the database.
SITEMAP_PAGES = ["", "search.html"]


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap(session: SessionDep) -> Response:
    """Served at /sitemap.xml by Caddy. Lists the home page, search and every published teacher."""
    base = config.site_url()
    teachers = session.exec(
        select(TeacherProfile.id, TeacherProfile.updated_at)
        .join(User, col(User.id) == TeacherProfile.user_id)
        .where(TeacherProfile.status == "approved", col(User.is_blocked).is_(False))
        .order_by(col(TeacherProfile.id))
    ).all()
    urls = [f"<url><loc>{escape(f'{base}/{page}')}</loc></url>" for page in SITEMAP_PAGES]
    urls += [
        f"<url><loc>{escape(f'{base}/teacher.html?id={tid}')}</loc><lastmod>{updated.date().isoformat()}</lastmod></url>"
        for tid, updated in teachers
    ]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    return Response(xml + "\n".join(urls) + "\n</urlset>\n", media_type="application/xml")
