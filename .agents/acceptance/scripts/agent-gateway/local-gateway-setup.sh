#!/usr/bin/env bash
# local-gateway-setup.sh — build and run a LOCAL agent gateway.
#
# Why: a local dev server signs the browser's token with its OWN `JWKS_KEY`, which
# the hosted gateway (agent-gateway.aspectlylabs.com) does not trust: it answers
# `auth_failed: signature verification failed`, so the client never receives the
# events of a run. A gateway that trusts the local key closes that loop locally.
# The device gateway has its own script: local-device-gateway-setup.sh.
#
# What it does: checks out the Orvilo gateway (private repository, the same changes
# production builds from) at a pinned commit, builds the agent gateway for this
# machine, and runs it on localhost with the PUBLIC half of the local key.
#
# Usage (from the repository root):
#   JWKS_KEY=... local-gateway-setup.sh start   # build if needed, then run in the foreground
#   local-gateway-setup.sh env                         # print the server-side settings to export
#
# Env:
#   JWKS_KEY           (required for start)  the dev server's JWKS, same value dev-up.sh receives
#   GATEWAY_PORT       (default 8788)        localhost port to listen on
#   SERVER_URL         (default http://localhost:3010)  dev server the gateway calls back
#   ORVILO_GATEWAY_DIR (default ~/.orvilo/agent-testing/gateway)  checkout and build cache
#
# Needs: go, git, and read access to github.com/alexj11324/orvilo-gateway.
# The service token is generated once into .records/env/agent-gateway.token
# (git-ignored, mode 600). It is never printed: pass it by variable.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
GATEWAY_REPO='https://github.com/alexj11324/orvilo-gateway.git'
# Upstream fed50da plus the Orvilo patches production applies, under the Orvilo name.
GATEWAY_REF='e7b28b5c89989bea344dde9e95a7724990cf6dae'
GATEWAY_DIR="${ORVILO_GATEWAY_DIR:-$HOME/.orvilo/agent-testing/gateway}"
PORT="${GATEWAY_PORT:-8788}"
SERVER_URL="${SERVER_URL:-http://localhost:3010}"
TOKEN_FILE="$REPO_ROOT/.records/env/agent-gateway.token"
BINARY="$GATEWAY_DIR/bin/agent-gateway-$GATEWAY_REF"

die() {
  echo "local-gateway-setup: $1" >&2
  exit 1
}

ensure_token() {
  [ -s "$TOKEN_FILE" ] && return
  mkdir -p "$(dirname "$TOKEN_FILE")"
  (umask 077 && node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))' > "$TOKEN_FILE")
}

build() {
  [ -x "$BINARY" ] && return
  command -v go > /dev/null || die 'go is required to build the gateway'
  if [ ! -d "$GATEWAY_DIR/src/.git" ]; then
    mkdir -p "$GATEWAY_DIR"
    git clone --quiet "$GATEWAY_REPO" "$GATEWAY_DIR/src" \
      || die "cannot clone $GATEWAY_REPO — it is private; check your GitHub access"
  fi
  git -C "$GATEWAY_DIR/src" fetch --quiet origin
  git -C "$GATEWAY_DIR/src" checkout --quiet --detach "$GATEWAY_REF" \
    || die "commit $GATEWAY_REF is not in $GATEWAY_REPO"
  mkdir -p "$GATEWAY_DIR/bin"
  (cd "$GATEWAY_DIR/src/agent-gateway-go" && go build -o "$BINARY" ./cmd/agent-gateway-go)
}

case "${1:-}" in
  start)
    [ -n "${JWKS_KEY:-}" ] || die 'JWKS_KEY is required (the same value the dev server runs with)'
    ensure_token
    build
    # The gateway only ever sees the public half of the key.
    JWKS_PUBLIC_KEY="$(node -e '
      const jwks = JSON.parse(process.env.JWKS_KEY);
      if (!Array.isArray(jwks.keys)) process.exit(1);
      const keys = jwks.keys.map(({ d, p, q, dp, dq, qi, ...key }) => key);
      process.stdout.write(JSON.stringify({ keys }));
    ')" || die 'JWKS_KEY is not a JWKS document'
    SERVICE_TOKEN="$(cat "$TOKEN_FILE")"
    export JWKS_PUBLIC_KEY SERVICE_TOKEN PORT ORVILO_API_BASE_URL="$SERVER_URL"
    unset JWKS_KEY
    echo "agent gateway $GATEWAY_REF on http://localhost:$PORT" >&2
    exec "$BINARY"
    ;;
  env)
    ensure_token
    echo "export ENABLE_AGENT_GATEWAY=1"
    echo "export AGENT_GATEWAY_URL=http://localhost:$PORT"
    echo "export AGENT_GATEWAY_SERVICE_TOKEN=\"\$(cat '$TOKEN_FILE')\""
    ;;
  *)
    die 'usage: local-gateway-setup.sh start|env'
    ;;
esac
