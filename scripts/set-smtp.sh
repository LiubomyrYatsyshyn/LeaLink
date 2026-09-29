#!/usr/bin/env bash
# Turn on real email sending: writes the SMTP settings to /opt/lealink/.env (never committed),
# restarts the API and sends a test email. Run it from your computer; it asks for everything,
# the SMTP key is typed hidden:
#   ssh -t root@159.223.18.155 'bash /opt/lealink/scripts/set-smtp.sh'
#
# DigitalOcean blocks ports 25, 465 and 587, so the default is Brevo on port 2525 (see docs/DEPLOY.md).
set -euo pipefail
umask 077
cd /opt/lealink

ask() { # ask "Question" "default" -> answer on stdout
  local answer
  read -r -p "$1${2:+ [$2]}: " answer
  echo "${answer:-$2}"
}

echo "Email settings for LeaLink (press Enter to keep the value in brackets)."
host=$(ask "SMTP server" "smtp-relay.brevo.com")
port=$(ask "SMTP port" "2525")
user=$(ask "SMTP login (Brevo: Settings -> SMTP & API -> SMTP tab)" "")
read -r -s -p "SMTP key / password (hidden): " password
echo
domain=$(grep -E '^SITE_DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d "'\"" || true)
sender=$(ask "Sender email (an address on your authenticated domain, or a verified sender)" "${domain:+noreply@$domain}")
to=$(ask "Send a test email to" "$sender")

if [ -z "$user" ] || [ -z "$password" ] || [ -z "$sender" ]; then
  echo "Login, key and sender email are required. Nothing was changed." >&2
  exit 1
fi
if [[ "$password$sender" == *"'"* ]]; then
  echo "The key or email contains a ' character, which .env can't hold. Nothing was changed." >&2
  exit 1
fi

touch .env
chmod 600 .env
{
  grep -v '^SMTP_' .env || true
  echo "SMTP_HOST=$host"
  echo "SMTP_PORT=$port"
  echo "SMTP_USER=$user"
  echo "SMTP_PASSWORD='$password'"
  echo "SMTP_FROM='LeaLink <$sender>'"
} > .env.new
mv .env.new .env
chmod 600 .env
echo "Saved to /opt/lealink/.env. Restarting the API..."

docker compose up -d api
docker compose exec -T api python -m app.cli send-test-email "$to"
