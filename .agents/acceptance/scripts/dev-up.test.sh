#!/usr/bin/env bash
# Exercise the startup environment without starting infra or a backend.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
source <(sed '/^case "${1:-start}"/,$d' "$SCRIPT_DIR/dev-up.sh")
ROOT="$TMP"
LOG_FILE="$TMP/dev.log"
CLERK_STUB_LOG="$TMP/clerk.log"
DEV_WAIT_SECONDS=120

# Only the environment resolver uses the real Bun runtime and its .env loader.
# The dev child records the environment it received instead of opening ports.
bun() {
  if [[ "${1:-}" == --print ]]; then
    command bun "$@"
  elif [[ "$*" == 'run dev' ]]; then
    printf '%s\n%s\n' "${CLERK_SECRET_KEY:-}" "${CLERK_API_URL:-}" > "$TMP/child.env"
  else
    return 1
  fi
}
nohup() { "$@"; }
lsof() { return 0; }
dev_lock_info() { [[ -f "$TMP/child.env" ]]; }
sleep() { command sleep 0.01; }

check() {
  local expected="$1" stub="$2"
  rm -f "$TMP/child.env"
  unset CLERK_API_URL
  export ORVILO_CLERK_STUB="$stub"
  start_dev >/dev/null
  [[ "$(sed -n '1p' "$TMP/child.env")" == "$expected" ]] || {
    echo 'FAIL: dev child received the wrong secret key' >&2; exit 1;
  }
  if [[ "$stub" == 1 ]]; then
    [[ "$(sed -n '2p' "$TMP/child.env")" == "http://127.0.0.1:$CLERK_STUB_PORT" ]]
  else
    [[ -z "$(sed -n '2p' "$TMP/child.env")" ]]
  fi
}

unset CLERK_SECRET_KEY
check sk_test_orvilo_local_stub 1
unset CLERK_SECRET_KEY
printf 'CLERK_SECRET_KEY="sk_test_repo_fixture"\n' > "$TMP/.env"
check sk_test_repo_fixture 1
export CLERK_SECRET_KEY=sk_test_shell_fixture
check sk_test_shell_fixture 1
[[ "$(cat "$TMP/.env")" == 'CLERK_SECRET_KEY="sk_test_repo_fixture"' ]]
rm "$TMP/.env"
unset CLERK_SECRET_KEY
check '' 0
printf 'dev-up environment tests passed\n'
