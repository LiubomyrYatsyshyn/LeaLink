"""LeaLink API. Runs behind Caddy: the site is at /, the API at /api, docs at /api/docs."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, housekeeping
from .routers import admin, auth, chats, meta, reports, requests, teacher, teachers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

DESCRIPTION = """
Backend for LeaLink — a site that connects learners and teachers.

* **Learner**: search teachers → send a request (up to 5 pending) → chat opens when the teacher accepts.
* **Teacher**: fill in the profile → moderation → accept or decline requests within 72 hours.
* Both confirm "We started lessons", then leave reviews.

Log in with `/api/auth/login`, then press **Authorize** and paste the `access_token`.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    config.PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    task = asyncio.create_task(housekeeping.loop()) if config.HOUSEKEEPING_INTERVAL > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(
    title="LeaLink API",
    version="1.0.0",
    description=DESCRIPTION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


api = APIRouter(prefix="/api")
for module in (meta, auth, teachers, teacher, requests, chats, reports, admin):
    api.include_router(module.router)
app.include_router(api)
app.mount("/api/uploads", StaticFiles(directory=config.UPLOAD_DIR, check_dir=False), name="uploads")
