# Deploy

Flow: code on the local computer -> push to GitHub (`main`) -> GitHub Actions
(`.github/workflows/deploy.yml`) logs in to the server over SSH, pulls `main`
and runs `docker compose up -d --build`. Never edit files on the server by hand.

## One-time server setup (Ubuntu/Debian VPS)

```bash
ssh root@<server> 'bash -s' < scripts/server-setup.sh
```

The script installs Docker, clones the repo to `/opt/lealink`, starts the
container and opens ports 22, 80 and 443 in the firewall.

## GitHub repository secrets

Settings -> Secrets and variables -> Actions:

- `SERVER_HOST` - server IP or domain
- `SERVER_USER` - SSH user on the server
- `SERVER_SSH_KEY_B64` - private deploy key as ONE line of base64 (`base64 < ~/.ssh/lealink_deploy | tr -d '\n'`); its public key is in the server's `~/.ssh/authorized_keys`
