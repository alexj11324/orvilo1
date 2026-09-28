#!/usr/bin/env bash
# dev-up.sh — one-shot local dev environment bring-up for this worktree.
#
# Wraps the manual dance: brew Postgres/Redis -> `bun run db:migrate` ->
# `bun run dev` (Next + Vite). Reuses an already-running dev server when the
# Next dev lock points at a live process, so calling it twice is safe and
# cheap.
#
# Usage:
#   dev-up.sh             # ensure everything is up; prints URLs (default)
#   dev-up.sh status      # report infra + server state without changing it
#   dev-up.sh restart     # stop the dev server, then start fresh
#   dev-up.sh stop        # stop the dev server (infra keeps running)
#   dev-up.sh logs        # tail the spawned dev server log
#
# Env overrides:
#   PG_PORT (5432)   Redis is probed on localhost:6379 via redis-cli.
#   DEV_WAIT_SECONDS (120) — how long `start` waits for the server to answer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOCK_FILE="$ROOT/.next/dev/lock"
LOG_FILE="$ROOT/.records/env/dev-server.log"
PG_PORT="${PG_PORT:-5432}"
DEV_WAIT_SECONDS="${DEV_WAIT_SECONDS:-120}"

c_ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
c_err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }
c_step() { printf '\033[36m→\033[0m %s\n' "$*"; }

have() { command -v "$1" >/dev/null 2>&1; }

# --- infra ---------------------------------------------------------------

ensure_postgres() {
  if have pg_isready && pg_isready -q -h localhost -p "$PG_PORT"; then
    c_ok "postgres ready on :$PG_PORT"
    return 0
  fi
  if have brew; then
    c_step "starting postgresql@17 via brew services"
    brew services start postgresql@17 >/dev/null
  fi
  local i
  for i in $(seq 1 30); do
    pg_isready -q -h localhost -p "$PG_PORT" && { c_ok "postgres ready on :$PG_PORT"; return 0; }
    sleep 1
  done
  c_err "postgres not reachable on localhost:$PG_PORT"
  return 1
}

ensure_redis() {
  if have redis-cli && [ "$(redis-cli -h localhost ping 2>/dev/null)" = "PONG" ]; then
    c_ok "redis ready on :6379"
    return 0
  fi
  if have brew; then
    c_step "starting redis via brew services"
    brew services start redis >/dev/null
  fi
  local i
  for i in $(seq 1 20); do
    [ "$(redis-cli -h localhost ping 2>/dev/null)" = "PONG" ] && { c_ok "redis ready on :6379"; return 0; }
    sleep 1
  done
  c_warn "redis not answering on localhost:6379 (continuing — some surfaces degrade)"
}

run_migrations() {
  c_step "db:migrate"
  (cd "$ROOT" && bun run db:migrate) | tail -3
}

# --- dev server detection ------------------------------------------------

# Prints "<pid> <port> <url>" when the Next dev lock names a live server that
# answers HTTP; non-zero exit otherwise.
dev_lock_info() {
  [ -f "$LOCK_FILE" ] || return 1
  local pid port url
  pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$LOCK_FILE" | head -1)"
  port="$(sed -n 's/.*"port":\([0-9]*\).*/\1/p' "$LOCK_FILE" | head -1)"
  url="$(sed -n 's/.*"appUrl":"\([^"]*\)".*/\1/p' "$LOCK_FILE" | head -1)"
  [ -n "$pid" ] && [ -n "$port" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  curl -sf --max-time 4 -o /dev/null "http://localhost:$port/" || return 1
  printf '%s %s %s\n' "$pid" "$port" "${url:-http://localhost:$port}"
}

# Find the Vite dev port: the startup log prints "dev ports — next: N, vite: M"
# for spawned runs; fall back to scanning the usual 9876-class listeners.
vite_port() {
  local port=""
  if [ -f "$LOG_FILE" ]; then
    port="$(grep -oE 'vite: [0-9]+' "$LOG_FILE" | tail -1 | grep -oE '[0-9]+')"
  fi
  if [ -n "$port" ] && curl -sf --max-time 2 -o /dev/null "http://localhost:$port/"; then
    printf '%s\n' "$port"; return 0
  fi
  port="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null \
    | awk '$9 ~ /:(98[0-9][0-9])$/ {sub(/.*:/,"",$9); print $9}' | sort -u | head -1)"
  if [ -n "$port" ]; then printf '%s\n' "$port"; return 0; fi
  return 1
}

# --- dev server lifecycle --------------------------------------------------

start_dev() {
  if dev_lock_info >/dev/null 2>&1; then
    return 0 # caller prints reuse message
  fi
  mkdir -p "$(dirname "$LOG_FILE")"
  c_step "spawning 'bun run dev' (log: ${LOG_FILE#$ROOT/})"
  (cd "$ROOT" && nohup bun run dev >"$LOG_FILE" 2>&1 &)
  local i
  for i in $(seq 1 "$DEV_WAIT_SECONDS"); do
    if dev_lock_info >/dev/null 2>&1; then return 0; fi
    # Bail early when the orchestrator already died (port clash, env error).
    if [ -s "$LOG_FILE" ] && grep -qE 'exited unexpectedly|No free port|EADDRINUSE' "$LOG_FILE"; then
      c_err "dev server died during startup — last log lines:"
      tail -8 "$LOG_FILE" >&2
      return 1
    fi
    sleep 1
  done
  c_err "dev server did not answer within ${DEV_WAIT_SECONDS}s — see $LOG_FILE"
  return 1
}

stop_dev() {
  local pid="" port=""
  if [ -f "$LOCK_FILE" ]; then
    pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$LOCK_FILE" | head -1)"
    port="$(sed -n 's/.*"port":\([0-9]*\).*/\1/p' "$LOCK_FILE" | head -1)"
  fi
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    c_step "stopping next dev (pid $pid)"
    kill "$pid" 2>/dev/null || true
  fi
  # The orchestrator's vite child survives the Next pid; kill by port too.
  local vp
  vp="$(vite_port 2>/dev/null || true)"
  if [ -n "$port" ]; then
    lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  fi
  if [ -n "$vp" ]; then
    lsof -nP -tiTCP:"$vp" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  fi
  c_ok "dev server stopped"
}

print_status() {
  echo "── infra ──"
  if have pg_isready && pg_isready -q -h localhost -p "$PG_PORT"; then
    c_ok "postgres :$PG_PORT"
  else
    c_warn "postgres down (:$PG_PORT)"
  fi
  if have redis-cli && [ "$(redis-cli -h localhost ping 2>/dev/null)" = "PONG" ]; then
    c_ok "redis :6379"
  else
    c_warn "redis down (:6379)"
  fi
  echo "── dev server ──"
  local info
  if info="$(dev_lock_info)"; then
    local pid port url
    read -r pid port url <<<"$info"
    c_ok "next: $url (pid $pid)"
    local vp
    if vp="$(vite_port)"; then
      c_ok "vite: http://localhost:$vp"
    else
      c_warn "vite: not found"
    fi
  else
    c_warn "dev server not running"
  fi
}

# --- entry -----------------------------------------------------------------

case "${1:-start}" in
  status)
    print_status
    ;;
  stop)
    stop_dev
    ;;
  restart)
    stop_dev
    sleep 1
    ensure_postgres && ensure_redis && run_migrations
    start_dev && print_status
    ;;
  logs)
    exec tail -f "$LOG_FILE"
    ;;
  start|up|"")
    ensure_postgres
    ensure_redis
    run_migrations
    if info="$(dev_lock_info)"; then
      read -r _pid _port url <<<"$info"
      c_ok "dev server already running: $url"
      print_status
    else
      start_dev && print_status
    fi
    ;;
  *)
    sed -n '2,18p' "$0"
    exit 2
    ;;
esac
