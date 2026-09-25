# LeaLink - working rules

Reply to the user in Ukrainian.

## Flow (agreed with the user)
1. Write code on the user's computer (this repo, `~/LeaLink-push`) and check it there.
2. Commit and push to GitHub (`LiubomyrYatsyshyn/LeaLink`, branch `main`, over SSH).
3. The server syncs from GitHub automatically (systemd timer, ~30 s) and rebuilds the Docker container. Test there too; Claude may test on the server.
4. Never edit files on the server by hand. Local, GitHub and server must always match.

## Local development (Mac, Docker Desktop)
- Start/rebuild: `docker compose up -d --build` in `~/LeaLink-push`, then open `http://localhost`.
- Stop: `docker compose down`. Docker Desktop must be running.

## Infrastructure
- Site: `site/` (static HTML) served by nginx in Docker (`Dockerfile`, `docker-compose.yml`).
- Server: DigitalOcean droplet, Ubuntu 24.04, `root@159.223.18.155`, project in `/opt/lealink`, container `lealink-web`, URL `http://159.223.18.155`.
- Auto-deploy: `deploy/lealink-deploy.timer` runs `scripts/auto-deploy.sh` every 30 s. Details in `docs/DEPLOY.md`.
- Design reference: `design-reference/LeaLink-D3-final-screens.pdf` (D3 "Split": green = learner, blue = teacher, Inter, English UI).

## Safety
- The repo is public: never commit secrets or private keys.
- Do not enter passwords, tokens or card data for the user; the user does account/payment steps.
