# LeaLink - working rules

Reply to the user in Ukrainian.

## Flow (agreed with the user)
1. Write code on the user's computer (this repo, `~/LeaLink-push`) and check it there.
2. Commit and push to GitHub (`LiubomyrYatsyshyn/LeaLink`, branch `main`, over SSH).
3. The server syncs from GitHub automatically (systemd timer, ~30 s) and rebuilds the Docker container. Test there too; Claude may test on the server.
4. Never edit files on the server by hand. Local, GitHub and server must always match.

## Local development (Mac)
- Same setup as the server: `docker compose up -d --build` in `~/LeaLink-push`, then `http://localhost` (site) and `http://localhost/api/docs` (API); stop with `docker compose down`. Docker Desktop must be running.
- Live editing of `site/`: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` (Caddy serves `site/` from disk).
- Demo teachers for local search: `docker compose exec api python -m app.cli seed-demo`.
- `python3 -m http.server 8090 --directory site` (`.claude/launch.json`: `lealink-site`) still opens the pages, but without the API they show error/empty states.

## Frontend (static HTML wired to the API)
- Built from `design-reference/` frames 00-41. Shared styles in `site/assets/css/lealink.css` (tokens from frame 00), behaviour in `site/assets/js/lealink.js` (icons, header, tabs, dialogs, chips, sliders, toasts).
- Data: `site/assets/js/api.js` (`window.LL`: fetch wrapper for `/api`, session, formatting, teacher card, report dialog), `filters.js` (search form on search/results), `review.js` (review dialog), and one script per page in `site/assets/js/pages/`. Plain JS, no build step.
- Session: token and user in localStorage (`ll-token`, `ll-user`; the header reads `ll-user`). Guests keep drafts in localStorage (`ll-draft-search`, `ll-draft-request`, `ll-draft-profile`) and send them after sign-up (`signup-learner.html`, `signup-teacher.html`).
- Pages render API data into the design markup; hooks are `data-*` attributes. Design sample content was removed from the HTML.
- `admin.html` (not in the design): moderation of profiles, reports, users; linked from the account menu for moderators.
- Caddy sends `Cache-Control: no-cache` for the site, so a deploy never mixes old and new JS.
- Headers are rendered by JS from `<header data-header="guest|auth|learner|teacher|wizard" data-active="...">`. Icons: `<i data-i="name">`.
- Role colour: `data-role="learner|teacher"` on `<body>` (or `.role-learner` / `.role-teacher` on a block).
- Screen states: pages set `data-show-state` blocks from real data; `?tab=` and `?step=1-6|preview` still work. `site/screens.html` links every frame to its page.
- Mobile (frames 35-41) is the same pages below 900 px, not separate files.
- Only "Continue with Google" still uses `data-demo` (not in the MVP).

## Backend (added 2026-09-27)
- `backend/`: FastAPI + SQLModel + Alembic + PostgreSQL, see `backend/README.md` (MVP point -> endpoint, page -> endpoint).
- Keep it simple: sync SQLModel sessions (`expire_on_commit=False`), JSON columns for lists, search filtered in Python, no Celery/Redis/websockets (chat = polling, request expiry = loop inside the API).
- Containers: `web` (Caddy, `/api/*` -> `api:8000`), `api`, `db` (no public port). Migrations run on API start.
- Tests: `docker compose run --rm api sh -c "pip install -q --user -r requirements-dev.txt && python -m pytest -q"` (own DB `lealink_test`).
- New migration: `docker compose run --rm -v "$PWD/backend:/app" api alembic revision --autogenerate -m "..."`.
- Moderator: `docker compose exec api python -m app.cli make-admin EMAIL`; demo teachers (local only): `... app.cli seed-demo`.

## Brand and motion (added 2026-09-26)
- Logo: vector mark in `site/assets/logo-mark.svg` (recreated from the user's image; swap in the original file if the user provides it). In pages use `data-logo` / `data-mark`; JS injects the SVG and the gradient wordmark. Montserrat is used only for the wordmark and the home hero title; UI stays Inter.
- Home hero follows the "grid + nodes" brief: 20/35 px gutter, grid lines with plus marks, numbered nav, staggered entrance (expo-out), chamfered info card, 3D network (spinning hub cube, pointer parallax, request dots). No video; light palette only.
- Other pages get band grid lines + plus marks and staggered reveal automatically from `lealink.js`.
- `prefers-reduced-motion` turns animation off. To review motion anyway open any page with `?motion=1` (remembered; `?motion=0` resets).

## Infrastructure
- Site: `site/` (static HTML) served by Caddy in Docker (`Dockerfile`, `docker-compose.yml`); `/api/*` goes to the backend container.
- Server: DigitalOcean droplet, Ubuntu 24.04, `root@159.223.18.155`, project in `/opt/lealink`, container `lealink-web`, URL `https://lealink.159.223.18.155.nip.io` (free nip.io name pointing at the server IP; sslip.io also works but the user's home router DNS cannot resolve it; set via `SITE_ADDRESS` in `/opt/lealink/.env`; the bare IP now redirects to https and does not work).
- HTTPS/domain: set `SITE_ADDRESS` in `/opt/lealink/.env` on the server (see `docs/DEPLOY.md`); without it the site is plain HTTP on the IP.
- Auto-deploy: `deploy/lealink-deploy.timer` runs `scripts/auto-deploy.sh` every 30 s. Details in `docs/DEPLOY.md`.
- Design reference: `design-reference/LeaLink-D3-final-screens.pdf` (D3 "Split": green = learner, blue = teacher, Inter, English UI).

## Safety
- The repo is public: never commit secrets or private keys.
- Do not enter passwords, tokens or card data for the user; the user does account/payment steps.
