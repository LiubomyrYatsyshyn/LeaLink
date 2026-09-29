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

The `web` container runs Caddy (`Caddyfile`). For every host in `SITE_ADDRESS` it gets a
Let's Encrypt certificate automatically (kept in the `caddy_data` volume) and renews it.
`SITE_DOMAIN` is the main domain: `www.` and any older address redirect there (308).

Move the site to your own domain:

1. Buy a domain at any registrar. If the registrar is Cloudflare, keep the records
   "DNS only" (grey cloud), otherwise Caddy can't get the certificate.
2. In the registrar's DNS settings create two records:

   | Type | Name  | Value            |
   |------|-------|------------------|
   | A    | `@`   | `159.223.18.155` |
   | A    | `www` | `159.223.18.155` |

3. After a few minutes run on your computer:

   ```bash
   ssh root@159.223.18.155 'bash /opt/lealink/scripts/set-domain.sh example.com'
   ```

   It checks that the domain points to the server, writes `SITE_ADDRESS` and
   `SITE_DOMAIN` to `/opt/lealink/.env`, restarts the containers and waits until
   `https://example.com` works. The old nip.io address keeps working as a redirect.
   Links in emails use the new domain automatically.

## Backend (API + database)

`docker compose` runs three containers: `lealink-web` (Caddy: site and HTTPS),
`lealink-api` (FastAPI, `backend/`) and `lealink-db` (PostgreSQL 16). Caddy sends
`/api/*` to the API; the database has no public port. Database migrations run
automatically when the API container starts. Details: `backend/README.md`.

Optional settings in `/opt/lealink/.env` (then `docker compose up -d`):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` - send real
  emails (see "Email" below). Without them emails are only written to
  `docker compose logs api`.
- `SITE_DOMAIN` - the main domain (set by `scripts/set-domain.sh`); links in emails use it.
- `SITE_URL` - override the address used in email links (rarely needed).
- `SECRET_KEY` - not needed: generated once and kept in the `api_data` volume.

## Email (Brevo)

The API sends emails automatically when something happens: new request, accepted or
declined, new chat message, lessons started, request expiring, profile published or
sent back, a teacher for a saved search. Each email is HTML with a plain-text copy and
one button that opens the right page (the chat, the requests...). Users turn email types
on and off in Account settings. Each email carries a Brevo tag (`new-request`,
`new-message`...), so Brevo -> Transactional -> Logs/Statistics shows them by type.

DigitalOcean blocks outgoing ports 25, 465 and 587 on Droplets; Brevo also accepts
port 2525 (`smtp-relay.brevo.com:2525`, free 300 emails a day).

1. Brevo account (free plan) - already done.
2. Authenticate your domain (after "Domain and HTTPS" above): Settings -> Senders,
   domains, IPs -> Domains -> Add a domain -> `example.com`. Brevo shows the DNS records
   to add at your registrar (usually a TXT "Brevo code", DKIM records and a DMARC TXT
   record). Add them exactly as shown, wait a few minutes, press "Authenticate".
   With an authenticated domain any address on it (e.g. `noreply@example.com`) can
   send without a confirmation code, and emails don't go to spam as often.
   Without a domain use a verified sender (Senders -> Add a sender, 6-digit code);
   Brevo then replaces a free address (@gmail.com) with its own.
3. Settings -> SMTP & API -> SMTP tab -> "Generate a new SMTP key". Copy it right away
   (Brevo shows it only once). The SMTP login (`...@smtp-brevo.com`) is on the same tab.
4. On your computer run (asks for the login, the key - typed hidden - and the sender,
   by default `noreply@<SITE_DOMAIN>`):

   ```bash
   ssh -t root@159.223.18.155 'bash /opt/lealink/scripts/set-smtp.sh'
   ```

   It writes `SMTP_*` to `/opt/lealink/.env`, restarts the API and sends a test email.

Check again at any time:

```bash
cd /opt/lealink && docker compose exec api python -m app.cli send-test-email you@example.com
```

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
