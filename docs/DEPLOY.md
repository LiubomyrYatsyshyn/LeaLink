# Deploy

Flow: code on the local computer -> push to GitHub (`main`) -> GitHub Actions
(`.github/workflows/deploy.yml`) logs in to the server over SSH, pulls `main`
and runs `docker compose up -d --build`. Never edit files on the server by hand.

## One-time server setup (Ubuntu/Debian VPS)

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/LiubomyrYatsyshyn/LeaLink.git /opt/lealink
cd /opt/lealink && docker compose up -d --build
```

## GitHub repository secrets

Settings -> Secrets and variables -> Actions:

- `SERVER_HOST` - server IP or domain
- `SERVER_USER` - SSH user on the server
- `SERVER_SSH_KEY` - private key of a dedicated deploy key (its public key is in the server's `~/.ssh/authorized_keys`)
