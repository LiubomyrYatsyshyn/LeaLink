#!/usr/bin/env bash
# One-time server setup (Ubuntu). Run as root on the server:
#   ssh root@<server> 'bash -s' < scripts/server-setup.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -d /opt/lealink/.git ]; then
  git clone https://github.com/LiubomyrYatsyshyn/LeaLink.git /opt/lealink
fi
cd /opt/lealink
git fetch origin main
git reset --hard origin/main
docker compose up -d --build

cp deploy/lealink-deploy.service deploy/lealink-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now lealink-deploy.timer

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
