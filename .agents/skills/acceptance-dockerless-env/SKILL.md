---
name: acceptance-dockerless-env
description: Run the local acceptance environment without Docker (brew Postgres + pgvector + Redis), pg_search marker-row workaround, Electron/CDP + agent-browser auth flow, and known gotchas for this repo's .agents/acceptance scripts.
---

# Dockerless Acceptance Environment (macOS, no Docker virtualization)

Use when `.agents/acceptance/scripts/init-dev-env.sh setup-db` fails because Docker/colima virtualization is unavailable on the host.

## Devin Secrets Needed

None. The seeded test account is created locally by `init-dev-env.sh seed-user`.

## Prereqs

```bash
brew install postgresql@17 pgvector redis   # brew pgvector targets pg17/pg18 on current taps
brew services start postgresql@17 redis
# psql bootstrap: createuser -s postgres (or use default superuser); the scripts expect
# postgresql://postgres:postgres@localhost:5432/postgres — set password or use trust in pg_hba
export PATH="$HOME/.bun/bin:$PATH"
npm i -g agent-browser   # if absent — check `agent-browser --version`
```

## Env overrides the scripts honor

`init-dev-env.sh apply_env` accepts env overrides instead of `.env`:

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
export REDIS_URL="redis://localhost:6379" DB_PORT=5432 REDIS_PORT=6379
```

Then run: `setup-db` (skipped — it requires docker/paradedb), `s3` (nohup), `seed-user`, `dev` (nohup). Resolved ports land in `.records/env/agent-testing-ports.env` (Next :26730-class, Vite :21725-class, s3rver :29000-class — auto-allocated, read the file).

## pg_search migration gap

`paradedb/paradedb` image and the pg_search extension are unobtainable on this host (homebrew tap 403 via git proxy, no virtualization). Migrations that create pg_search/bm25 indexes (e.g. 0090, 0093) will fail.

Workaround (verified): apply the non-pg_search migrations by hand, then mark the pg_search ones applied in `drizzle.__drizzle_migrations`:

```sql
-- row format: (id uuid?, hash text, created_at bigint) — hash = sha256 of the .sql file contents,
-- created_at = the journal entry's `when` (folderMillis). Insert one row per skipped migration.
```

Dialect applies only entries with `folderMillis > max(created_at)`, so a marker row with the real `when` makes drizzle skip it. Search/FTS features will be absent — only use this when the test path doesn't touch them.

## Auth & surfaces

- Web seed: `.agents/acceptance/scripts/setup-auth.sh web-seed` → drives `agent-browser --session orvilo-dev`; verify with `setup-auth.sh status --surface web`.
- Electron: `.agents/acceptance/scripts/electron-dev.sh start` (CDP :9222). `login-status` reports snapshot/golden-profile state; `stop` snapshots login into `~/.orvilo/agent-testing/electron-login`.
- Electron login CANNOT be acquired headlessly: OAuth (`requestAuthorization`) is forbidden and hijacks the user's browser; no IPC accepts raw tokens (`saveTokens` is not `@IpcMethod`-decorated); macOS `safeStorage` blocks plaintext store injection (decrypt runs at read time). No snapshot → mark Electron signed-in checks blocked; one manual sign-in fixes all future runs.
- `/signin`+`/signup` are a separate auth bundle (`entry.auth.tsx`) — no SPAGlobalProvider, no session-auth listener. For non-`(main)` route probes use e.g. `/verify-im` (stays mounted signed-out).

## Probes that worked here

```bash
# session-auth subscriber count on the live SPA (use the Vite origin, NOT the Next proxy port):
agent-browser --session X eval "import('http://localhost:21725/src/layout/AuthProvider/SessionAuth/events.ts').then(m => m.sessionAuthEvents.listeners.get('session-auth-expired')?.size)"
# emit to trigger the real recovery → expect redirect to /signin?callbackUrl=...&reason=sessionExpired
agent-browser --session X eval "import('http://localhost:21725/src/layout/AuthProvider/SessionAuth/events.ts').then(m => { m.sessionAuthEvents.emit('session-auth-expired', {reason:'probe', source:'trpc', timestamp: Date.now()}); return 'emitted'; })"
# desktop build flag in renderer:
agent-browser --cdp 9222 eval "typeof __ELECTRON__ !== 'undefined' && !!__ELECTRON__"
```

## Gotchas

- `computer` `type` action drops/mangles `@` and `/` — use `printf '...' | pbcopy` + Cmd+V for emails/URLs.
- Import probes via the Next port fail (module not served there) — always import from the Vite origin; both windows share the same module instance.
- Agent-browser `open` right after seeding can race the auth redirect; `status --surface web` is the source of truth, retry the open.
