#!/usr/bin/env bash
# Move LeaLink to your own domain: https://DOMAIN with an automatic HTTPS certificate (Caddy).
# www.DOMAIN and the previous address keep working and redirect to https://DOMAIN.
#
# First, at your domain registrar, create two DNS records pointing to this server:
#   A   @     159.223.18.155
#   A   www   159.223.18.155
# Then run from your computer:
#   ssh root@159.223.18.155 'bash /opt/lealink/scripts/set-domain.sh example.com'
set -euo pipefail
umask 077
cd /opt/lealink

domain=$(echo "${1:-}" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##; s#^www\.##')
if ! [[ "$domain" =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]]; then
  echo "Usage: set-domain.sh example.com" >&2
  exit 1
fi

# The domain must already point here, otherwise Let's Encrypt can't issue the certificate.
ip=$(curl -fsS --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')
for host in "$domain" "www.$domain"; do
  found=$(getent ahostsv4 "$host" | awk '{print $1; exit}' || true)
  if [ "$found" != "$ip" ]; then
    echo "DNS: $host points to ${found:-nothing}, but this server is $ip." >&2
    echo "Add an A record for $host -> $ip at your registrar, wait a few minutes and run again." >&2
    exit 1
  fi
done

# Keep the hosts served until now: they get certificates too and redirect to the new domain.
touch .env
old=$(grep -E '^SITE_ADDRESS=' .env | cut -d= -f2- | tr -d "'\"" || true)
hosts="$domain, www.$domain"
for h in $(echo "$old" | tr ',' ' '); do
  case "$h" in "" | :* | "$domain" | "www.$domain") ;; *) hosts="$hosts, $h" ;; esac
done
{
  grep -vE '^(SITE_ADDRESS|SITE_DOMAIN|SITE_URL)=' .env || true
  echo "SITE_ADDRESS='$hosts'"
  echo "SITE_DOMAIN=$domain"
} > .env.new
mv .env.new .env
echo "Serving: $hosts (main: $domain)"

docker compose up -d
echo "Waiting for the HTTPS certificate..."
for _ in $(seq 1 36); do
  if curl -fsS -o /dev/null --max-time 5 "https://$domain/api/health"; then
    echo "Done: https://$domain works. www.$domain and the old address redirect there."
    exit 0
  fi
  sleep 5
done
echo "HTTPS isn't ready yet. See: cd /opt/lealink && docker compose logs web --tail 50" >&2
exit 1
