# Deploy

Flow: code on the local computer -> push to GitHub (`main`) -> the server
notices the new commit within ~30 seconds and rebuilds the Docker container.
Never edit files on the server by hand.

How it works: `deploy/lealink-deploy.timer` (systemd) runs
`scripts/auto-deploy.sh` every 30 seconds. The script does `git fetch`; if
`origin/main` moved, it runs `git reset --hard origin/main` and
`docker compose up -d --build`. No secrets or GitHub Actions are involved
(the repository is public, so the server clones it over https).

## One-time server setup (Ubuntu/Debian VPS)

```bash
ssh root@<server> 'bash -s' < scripts/server-setup.sh
```

The script installs Docker, clones the repo to `/opt/lealink`, starts the
container, enables the deploy timer and opens ports 22, 80 and 443.

## Domain and HTTPS (Caddy)

The container runs Caddy (`Caddyfile`). Without a domain it serves plain HTTP
on the server IP. To enable HTTPS for a domain:

1. At the registrar, create DNS records: `A @ -> <server IP>` and `A www -> <server IP>`.
2. On the server create `/opt/lealink/.env` (untracked, survives deploys):
   `SITE_ADDRESS=example.com, www.example.com`
3. `cd /opt/lealink && docker compose up -d` - Caddy gets a Let's Encrypt
   certificate automatically. Certificates are kept in the `caddy_data` volume.

## Backend (API + database)

`docker compose` runs three containers: `lealink-web` (Caddy: site and HTTPS),
`lealink-api` (FastAPI, `backend/`) and `lealink-db` (PostgreSQL 16). Caddy sends
`/api/*` to the API; the database has no public port. Database migrations run
automatically when the API container starts. Details: `backend/README.md`.

Optional settings in `/opt/lealink/.env` (then `docker compose up -d`):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` - send real
  emails (see "Email" below). Without them emails are only written to
  `docker compose logs api`.
- `SITE_URL` - the link in emails (by default taken from `SITE_ADDRESS`).
- `SECRET_KEY` - not needed: generated once and kept in the `api_data` volume.

## Email (SMTP)

DigitalOcean blocks outgoing ports 25, 465 and 587 on Droplets, so Gmail and most
SMTP servers can't be reached. Use a provider that accepts port 2525:
Brevo (`smtp-relay.brevo.com:2525`, free 300 emails a day).

1. Sign up at brevo.com (free plan).
2. Add a sender: Senders, Domains & Dedicated IPs -> Senders -> Add a sender, then
   enter the 6-digit code Brevo emails to that address. Unverified senders can't send.
3. Account menu -> Settings -> SMTP & API -> SMTP tab -> "Generate a new SMTP key".
   Copy the key right away (Brevo shows it only once). The SMTP login is on the same
   tab (an address like `...@smtp-brevo.com`).
4. On your computer run (it asks for the login, key and sender; the key is typed hidden):

   ```bash
   ssh -t root@159.223.18.155 'bash /opt/lealink/scripts/set-smtp.sh'
   ```

   It writes `SMTP_*` to `/opt/lealink/.env`, restarts the API and sends a test email.

Check again at any time:

```bash
cd /opt/lealink && docker compose exec api python -m app.cli send-test-email you@example.com
```

Without an own domain, Brevo replaces a free sender address (@gmail.com) with its own,
and some emails may land in spam. With a domain, authenticate it in Brevo
(Senders, Domains -> Domains) and use an address on it as the sender.

Moderator rights (the user signs up on the site first):

```bash
cd /opt/lealink && docker compose exec api python -m app.cli make-admin you@example.com
```

Database backup:

```bash
cd /opt/lealink && docker compose exec -T db pg_dump -U lealink lealink > lealink-$(date +%F).sql
```

## Useful commands on the server

```bash
systemctl list-timers lealink-deploy.timer   # is the timer running
journalctl -u lealink-deploy -n 20           # last deploys
docker ps                                    # lealink-web, lealink-api, lealink-db
docker compose logs api --tail 50            # API log (and emails without SMTP)
```
