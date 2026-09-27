# LeaLink backend

FastAPI + SQLModel + Alembic + PostgreSQL. It runs in Docker next to the static site:
Caddy serves the site at `/` and forwards `/api/*` to this app.

- API docs (Swagger, try requests there): `/api/docs` — locally http://localhost/api/docs
- Health check: `/api/health`

## How the MVP maps to the API

| MVP point | How it works | Endpoints |
|---|---|---|
| 1. Learner or teacher | One account can do both. A user becomes a teacher by filling in a teacher profile. | `POST /api/auth/register`, `/login`, `GET /api/auth/me` |
| 2. Search and requests | Learner filters teachers; strict filters hide teachers, soft ones (topics, level, goal, age, time) give the match %. | `GET /api/teachers/search`, `GET /api/teachers/{id}`, `POST /api/requests` |
| 3. Chat for first arrangements | A chat per accepted request. The frontend polls for new messages. | `GET /api/chats`, `GET /api/chats/{id}?after_id=`, `POST /api/chats/{id}/messages` |
| 6. Statuses and 72 h deadline | `pending → accepted / declined / withdrawn / expired`, `accepted → closed`. Expired requests are closed automatically (checked every minute). The learner gets an email 12 h before expiry. | `POST /api/requests/{id}/accept`, `/decline`, `/withdraw`, `/close` |
| 7. Chat only after accept | Chat endpoints return 403 until the teacher accepts. The teacher's contact is shown only then. | |
| 8. "We started lessons" and reviews | Both sides confirm; then each can leave one review (editable for 14 days). Learners' reviews make the teacher's rating. | `POST /api/requests/{id}/started`, `POST`/`PATCH /api/requests/{id}/review`, `GET /api/teachers/{id}/reviews` |
| 9. Moderation | Profile: `draft → pending → approved / rejected`. Only approved profiles are public. Editing a published profile sends it back to review (except the "Accepting new students" switch). | `PUT /api/teacher/profile`, `POST /api/teacher/profile/submit`, `/api/admin/teachers...` |
| 10. Email | New request, accepted, declined, first unread chat message, lessons started, expiry warning, moderation result, "Notify me". Without SMTP settings emails go to the log. | |
| 11. Empty search | `relax` in the search answer: which single filter to remove and how many teachers that shows. "Notify me" saves the search and emails once a matching teacher is published. | `POST /api/alerts` |
| 12. Request limit | Max 5 pending requests per learner; declined, withdrawn and expired free a slot. No duplicate open request to the same teacher. | `GET /api/requests/sent` (`active`, `limit`) |
| 13. Report | Report a teacher profile or the other person in a chat. Moderators resolve reports and can block users (a blocked user can't log in and disappears from search). | `POST /api/reports`, `/api/admin/reports`, `/api/admin/users/{id}/block` |

## Screens → endpoints

| Page | Endpoints |
|---|---|
| `login.html`, `signup*.html` | `POST /api/auth/login`, `POST /api/auth/register` (then send the saved request or profile) |
| `search.html`, `results.html` | `GET /api/meta` (option lists), `GET /api/teachers/search`, `POST /api/alerts`, `POST /api/reports` |
| `teacher.html` | `GET /api/teachers/{id}`, `GET /api/teachers/{id}/reviews` |
| `request.html` | `POST /api/requests` (the teacher's `questions` come from `GET /api/teachers/{id}`) |
| `learner.html` | `GET /api/requests/sent`, `POST /api/requests/{id}/withdraw`, `/started`, `/review` |
| `wizard.html`, `under-review.html` | `PUT /api/teacher/profile`, `POST /api/auth/me/photo`, `POST /api/teacher/certificates`, `POST /api/teacher/profile/submit` |
| `teacher-home.html` | `GET /api/teacher/profile`, `GET /api/requests/incoming`, `GET /api/requests/students`, `POST /api/requests/{id}/accept`, `/decline`, `/started`, `/review`, `/close` |
| `chat.html`, `chat-teacher.html` | `GET /api/chats?as=learner` / `?as=teacher`, `GET /api/chats/{id}`, `POST /api/chats/{id}/messages` |
| `settings.html` | `GET`/`PATCH /api/auth/me`, `POST`/`DELETE /api/auth/me/photo`, `POST /api/auth/change-password` |

Auth: send `Authorization: Bearer <access_token>` (from login/register). Logging out = forgetting the token.
Changing the password logs out all other devices.

Option values (levels `A1`–`C2`, goals, formats, time slots like `mon_evening`, decline reasons...) are listed by
`GET /api/meta` and in `app/vocab.py`.

## Code

```
app/
  main.py          FastAPI app, routers, uploads, the request-expiry loop
  config.py        settings from environment variables, business rules (72 h, 5 requests...)
  models.py        database tables (SQLModel)
  schemas.py       API input/output
  vocab.py         fixed option lists
  security.py      passwords (argon2), JWT, current user
  matching.py      teacher search and match %
  views.py         database rows -> API responses
  housekeeping.py  expire requests after 72 h, warn 12 h before
  emails.py        SMTP or log
  files.py         photo and certificate uploads
  cli.py           make-admin, seed-demo
  routers/         auth, teachers (public), teacher (my profile), requests, chats, reports, admin, meta
alembic/           migrations (applied automatically when the container starts)
tests/             pytest, runs against a separate database lealink_test
```

## Run locally (Docker Desktop)

```bash
docker compose up -d --build                           # site + API + database
docker compose exec api python -m app.cli seed-demo    # optional: 6 published demo teachers
```

Open http://localhost (site) and http://localhost/api/docs (API).

Make yourself a moderator (sign up first, through the site or `/api/docs`):

```bash
docker compose exec api python -m app.cli make-admin you@example.com
```

## Tests

```bash
docker compose run --rm api sh -c "pip install -q --user -r requirements-dev.txt && python -m pytest -q"
```

The tests create and wipe their own database `lealink_test`; the real data in `lealink` is not touched.

## Changing the database

1. Edit `app/models.py`.
2. Generate a migration (the container needs the source folder mounted to write the file back):
   ```bash
   docker compose run --rm -v "$PWD/backend:/app" api alembic revision --autogenerate -m "Add something"
   ```
3. Check the new file in `alembic/versions/`, commit it. The server applies it on the next deploy.

## Settings (environment variables)

Set them in `.env` next to `docker-compose.yml` (on the server: `/opt/lealink/.env`, never committed).

| Variable | Default | Meaning |
|---|---|---|
| `SECRET_KEY` | generated once and kept in the `api_data` volume | signs login tokens |
| `POSTGRES_PASSWORD` | `lealink` | database password. The database has no public port. Set it before the first start; later changes need `ALTER USER lealink PASSWORD '...'` in the database too |
| `SITE_URL` | from `SITE_ADDRESS`, else `http://localhost` | link in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | empty | email sending; empty `SMTP_HOST` = emails only in `docker compose logs api` |
| `CORS_ORIGINS` | empty | only if the frontend is served from another domain |
