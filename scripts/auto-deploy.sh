#!/usr/bin/env bash
# Runs on the server every 30s (see deploy/lealink-deploy.timer).
# If GitHub `main` has new commits, pull them and rebuild the container.
# Wrapped in main() so the script can safely replace itself during `git reset`.
main() {
  set -euo pipefail
  cd /opt/lealink
  git fetch -q origin main
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    echo "New commit: $(git rev-parse --short origin/main) - deploying"
    git reset --hard origin/main
    docker compose up -d --build --remove-orphans
    echo "Deployed $(git rev-parse --short HEAD)"
  fi
}
main "$@"
exit $?
