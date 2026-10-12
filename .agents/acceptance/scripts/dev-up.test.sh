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
    printf '%s\n%s\n%s\n%s\n' "${CLERK_SECRET_KEY:-}" "${CLERK_API_URL:-}" \
      "${VITE_CLERK_PUBLISHABLE_KEY:-}" "${CLERK_ISSUER:-}" > "$TMP/child.env"
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

# Stub mode starts without a Clerk instance: a missing publishable key gets a
# placeholder, and the issuer follows it even when .env still names a real one.
PLACEHOLDER_KEY="pk_test_$(printf 'clerk.local.test$' | base64)"
check_publisher() {
  local expected_key="$1" expected_issuer="$2"
  unset CLERK_SECRET_KEY VITE_CLERK_PUBLISHABLE_KEY CLERK_ISSUER
  check sk_test_orvilo_local_stub 1
  [[ "$(sed -n '3p' "$TMP/child.env")" == "$expected_key" ]] || {
    echo 'FAIL: dev child received the wrong publishable key' >&2; exit 1;
  }
  [[ "$(sed -n '4p' "$TMP/child.env")" == "$expected_issuer" ]] || {
    echo 'FAIL: dev child received the wrong issuer' >&2; exit 1;
  }
}
printf 'CLERK_ISSUER="https://real.clerk.accounts.dev"\n' > "$TMP/.env"
check_publisher "$PLACEHOLDER_KEY" https://clerk.local.test
REAL_KEY="pk_test_$(printf 'real.clerk.accounts.dev$' | base64)"
printf 'VITE_CLERK_PUBLISHABLE_KEY="%s"\n' "$REAL_KEY" > "$TMP/.env"
check_publisher "$REAL_KEY" ''
rm "$TMP/.env"
printf 'dev-up environment tests passed\n'
