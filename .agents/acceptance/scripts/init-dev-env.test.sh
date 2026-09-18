#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/init-dev-env.sh"
TMP="$(mktemp -d)"
PIDS=()

cleanup() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

mkdir -p "$TMP/bin"
cat > "$TMP/bin/bun" <<'SH'
#!/usr/bin/env bash
sleep 300 &
wait
SH
chmod +x "$TMP/bin/bun"

# A real Hatchet token carries its REST and gRPC endpoints. The SDK falls back
# to those claims only when the optional HATCHET_CLIENT_* overrides are absent;
# an exported empty string is still an override and prevents that fallback.
ENV_OUTPUT="$({
  env -u HATCHET_CLIENT_API_URL -u HATCHET_CLIENT_HOST_PORT \
    -u HATCHET_CLIENT_NAMESPACE -u HATCHET_CLIENT_TLS_STRATEGY \
    AGENT_TESTING_PORTS_FILE="$TMP/ports.env" "$SCRIPT" env
})"
for key in HATCHET_CLIENT_API_URL HATCHET_CLIENT_HOST_PORT HATCHET_CLIENT_NAMESPACE HATCHET_CLIENT_TLS_STRATEGY; do
  if grep -Fq "export $key=" <<< "$ENV_OUTPUT"; then
    echo "optional Hatchet override $key was exported without a value" >&2
    exit 1
  fi
  if ! grep -Fq "unset $key" <<< "$ENV_OUTPUT"; then
    echo "missing explicit unset for optional Hatchet override $key" >&2
    exit 1
  fi
done

# Preflight must resolve endpoint claims from a token when no explicit endpoint
# overrides are supplied. The stubs keep this deterministic and prove that the
# API and gRPC probes target the addresses the worker SDK will use.
printf 'ALLOC_SERVER_PORT=41001\nALLOC_SPA_PORT=41002\n' > "$TMP/ports.env"
REAL_NODE="$(command -v node)"
CURL_LOG="$TMP/curl.log"
NC_LOG="$TMP/nc.log"
cat > "$TMP/bin/docker" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == ps ]]; then
  printf 'orvilo-agent-testing-redis\n'
fi
SH
cat > "$TMP/bin/curl" <<'SH'
#!/usr/bin/env bash
url=""
for arg in "$@"; do
  url="$arg"
done
printf '%s\n' "$url" >> "$CURL_LOG"
case "$url" in
  http://hatchet.example.test/api/ready|http://app.example.test)
    printf '200'
    ;;
  *)
    printf '000'
    ;;
esac
SH
cat > "$TMP/bin/nc" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$NC_LOG"
SH
cat > "$TMP/bin/node" <<SH
#!/usr/bin/env bash
case "\$*" in
  *check-s3.mjs*) exit 0 ;;
esac
exec "$REAL_NODE" "\$@"
SH
chmod +x "$TMP/bin/docker" "$TMP/bin/curl" "$TMP/bin/nc" "$TMP/bin/node"

HATCHET_TOKEN='header.eyJzdWIiOiJ0ZW5hbnQiLCJzZXJ2ZXJfdXJsIjoiaHR0cDovL2hhdGNoZXQuZXhhbXBsZS50ZXN0IiwiZ3JwY19icm9hZGNhc3RfYWRkcmVzcyI6ImhhdGNoZXQuZXhhbXBsZS50ZXN0OjcwNzcifQ.signature'
if ! PATH="$TMP/bin:$PATH" \
  CURL_LOG="$CURL_LOG" NC_LOG="$NC_LOG" \
  AGENT_TESTING_PORTS_FILE="$TMP/ports.env" \
  APP_URL=http://app.example.test AGENT_RUNTIME_MODE=queue \
  HATCHET_CLIENT_TOKEN="$HATCHET_TOKEN" JWKS_KEY=fixture \
  "$SCRIPT" preflight > "$TMP/preflight.log" 2>&1; then
  echo "preflight rejected token-embedded Hatchet endpoints" >&2
  sed -n '1,120p' "$TMP/preflight.log" >&2
  exit 1
fi
grep -Fxq 'http://hatchet.example.test/api/ready' "$CURL_LOG"
grep -Fq 'hatchet.example.test 7077' "$NC_LOG"
grep -Fq 'Hatchet control plane and worker endpoint reachable' "$TMP/preflight.log"

start_fixture() {
  local state="$1" server_port="$2" spa_port="$3"
  PATH="$TMP/bin:$PATH" \
    AGENT_TESTING_DEV_STATE_FILE="$state" \
    SERVER_PORT="$server_port" SPA_PORT="$spa_port" \
    "$SCRIPT" dev > "$state.log" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  for _ in $(seq 1 50); do
    [[ -f "$state" ]] && break
    sleep 0.1
  done
  [[ -f "$state" ]]
  kill -0 "$pid"
  LAST_PID="$pid"
}

STATE_A="$TMP/a.state"
STATE_B="$TMP/b.state"
start_fixture "$STATE_A" 41001 41002
PID_A="$LAST_PID"
start_fixture "$STATE_B" 42001 42002
PID_B="$LAST_PID"

if PATH="$TMP/bin:$PATH" AGENT_TESTING_DEV_STATE_FILE="$STATE_A" \
  SERVER_PORT=41001 SPA_PORT=41002 "$SCRIPT" dev > "$TMP/duplicate-a.log" 2>&1; then
  echo "duplicate start unexpectedly replaced an active ownership record" >&2
  exit 1
fi
if ! kill -0 "$PID_A" 2>/dev/null; then
  echo "duplicate start disturbed the active owned process" >&2
  exit 1
fi

AGENT_TESTING_DEV_STATE_FILE="$STATE_A" "$SCRIPT" clean > "$TMP/clean-a.log"
for _ in $(seq 1 30); do
  kill -0 "$PID_A" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "$PID_A" 2>/dev/null; then
  echo "owned process A survived clean" >&2
  exit 1
fi
if ! kill -0 "$PID_B" 2>/dev/null; then
  echo "sibling process B was killed by cleaning A" >&2
  exit 1
fi

STATE_C="$TMP/c.state"
start_fixture "$STATE_C" 43001 43002
PID_C="$LAST_PID"
sed -i.bak 's/^PROCESS_START=.*/PROCESS_START=stale/' "$STATE_C"
if AGENT_TESTING_DEV_STATE_FILE="$STATE_C" "$SCRIPT" clean > "$TMP/clean-c.log" 2>&1; then
  echo "stale ownership metadata unexpectedly succeeded" >&2
  exit 1
fi
if ! kill -0 "$PID_C" 2>/dev/null; then
  echo "stale ownership metadata killed an unverified process" >&2
  exit 1
fi

echo "init-dev-env ownership tests passed"
