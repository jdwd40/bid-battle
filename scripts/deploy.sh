#!/usr/bin/env bash
# Deploy the current commit to app-server (reached through hermes) as a new release, then restart the service.
# Usage: scripts/deploy.sh [--force]   (--force deploys even while a match is running, ending it)
# See README "Deploying" and docs/adr/0001.
set -Eeuo pipefail

PUBLIC_URL="https://bidbattle.jdwd40.com"
SSH=(ssh -o BatchMode=yes -J jd@hermes -p 4020 jd@100.103.129.22)
BASE=/srv/bid-battle
FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has uncommitted changes; commit or stash them first." >&2
  exit 1
fi
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"

# 1. Refuse to end a running match unless forced. A missing server (first deploy) counts as idle.
if status="$(curl -fsS --max-time 10 "$PUBLIC_URL/status" 2>/dev/null)"; then
  active="$(sed -E 's/.*"activeMatches":([0-9]+).*/\1/' <<<"$status")"
  if [[ "$active" != "0" && "$FORCE" != true ]]; then
    echo "$active match(es) in progress ($status). Wait for them to finish, or rerun with --force." >&2
    exit 1
  fi
fi

# 2. Build locally.
npm run build

# 3. Ship the release: the manifests plus the built server and client.
echo "Uploading release $RELEASE"
tar -czf - package.json package-lock.json \
  packages/engine/package.json packages/server/package.json packages/web/package.json \
  packages/server/dist packages/web/dist \
  | "${SSH[@]}" "set -e; mkdir -p $BASE/releases/$RELEASE && tar -xzf - -C $BASE/releases/$RELEASE"

# 4. Install runtime dependencies, switch the current link, install the unit, restart.
"${SSH[@]}" bash -s -- "$RELEASE" < <(cat <<'REMOTE'
set -Eeuo pipefail
RELEASE="$1"; BASE=/srv/bid-battle; DIR="$BASE/releases/$RELEASE"
cd "$DIR"
npm ci --omit=dev --workspace=@bid-battle/server --no-audit --no-fund --loglevel=error
ln -sfn "$DIR" "$BASE/current.tmp" && mv -Tf "$BASE/current.tmp" "$BASE/current"
REMOTE
)
"${SSH[@]}" "sudo install -o root -g root -m 0644 /dev/stdin /etc/systemd/system/bid-battle.service" < deploy/bid-battle.service
"${SSH[@]}" "set -e; sudo systemctl daemon-reload; sudo systemctl enable bid-battle >/dev/null 2>&1; sudo systemctl restart bid-battle
for i in \$(seq 1 20); do curl -fsS --max-time 2 http://127.0.0.1:3220/health >/dev/null 2>&1 && exit 0; sleep 0.5; done
echo 'Service did not become healthy:' >&2; sudo journalctl -u bid-battle -n 30 --no-pager >&2; exit 1"

# 5. Keep the five newest releases.
"${SSH[@]}" "cd $BASE/releases && ls -1 | sort | head -n -5 | xargs -r rm -rf"

echo "Deployed $RELEASE. Local health OK; public: $PUBLIC_URL/health"
