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

## Useful commands on the server

```bash
systemctl list-timers lealink-deploy.timer   # is the timer running
journalctl -u lealink-deploy -n 20           # last deploys
docker ps                                    # the lealink-web container
```
