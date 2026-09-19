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
brew install postgresql@17 pgvector redis # brew pgvector targets pg17/pg18 on current taps
brew services start postgresql@17 redis
# psql bootstrap: createuser -s postgres (or use default superuser); the scripts expect
# postgresql://postgres:postgres@localhost:5432/postgres — set password or use trust in pg_hba
export PATH="$HOME/.bun/bin:$PATH"
npm i -g agent-browser # if absent — check `agent-browser --version`
```

## Env overrides the scripts honor

`init-dev-env.sh apply_env` accepts env overrides instead of `.env`:

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
export REDIS_URL="redis://localhost:6379" DB_PORT=5432 REDIS_PORT=6379
```

Then run: `setup-db` (skipped — it requires docker/paradedb), `s3` (nohup), `seed-user`, `dev` (nohup). Resolved ports land in `.records/env/agent-testing-ports.env` (Next :26730-class, Vite :21725-class, s3rver :29000-class — auto-allocated, read the file).

## pg\_search migration gap

`paradedb/paradedb` image and the pg\_search extension are unobtainable on this host (homebrew tap 403 via git proxy, no virtualization). Migrations that create pg\_search/bm25 indexes (e.g. 0090, 0093) will fail.

Workaround (verified): apply the non-pg\_search migrations by hand, then mark the pg\_search ones applied in `drizzle.__drizzle_migrations`:

```sql
-- row format: (id uuid?, hash text, created_at bigint) — hash = sha256 of the .sql file contents,
-- created_at = the journal entry's `when` (folderMillis). Insert one row per skipped migration.
```

Dialect applies only entries with `folderMillis > max(created_at)`, so a marker row with the real `when` makes drizzle skip it. Search/FTS features will be absent — only use this when the test path doesn't touch them.

## Auth & surfaces

- Web seed: `.agents/acceptance/scripts/setup-auth.sh web-seed` → drives `agent-browser --session orvilo-dev`; verify with `setup-auth.sh status --surface web`.
- Electron: `.agents/acceptance/scripts/electron-dev.sh start` (CDP :9222). `login-status` reports snapshot/golden-profile state; `stop` snapshots login into `~/.orvilo/agent-testing/electron-login`.
- `/signin`+`/signup` are a separate auth bundle (`entry.auth.tsx`) — no SPAGlobalProvider, no session-auth listener. For non-`(main)` route probes use e.g. `/verify-im` (stays mounted signed-out).

## Scripted Electron OIDC sign-in

The dev Electron instance CAN be signed in fully scripted — no manual step needed. The OAuth browser hop is authorized on this machine (opens in Safari, the VM default browser).

1. Boot signed-out: `electron-dev.sh start` → renderer lands on `/onboarding` LoginStep.
2. LoginStep → "Connect to your own Orvilo server instance" → enter `http://localhost:26730` → Connect.
   - Calls `connectRemoteServer({remoteServerUrl, storageMode:'selfHost'})` → `requestAuthorization`.
3. `requestAuthorization` builds `{server}/oidc/auth?client_id=orvilo-desktop&redirect_uri={server}/oidc/callback/desktop&prompt=consent&scope=profile email offline_access&state&code_challenge` and `shell.openExternal` opens it in **Safari**.
4. In Safari: better-auth login form → sign in (test account) → consent screen → authorize.
   - First login pops a "Terms and Privacy Policy" modal → click **"Agree and continue"**.
   - Then a "Save Password?" prompt → **"Not Now"**.
5. Server `/oidc/callback/desktop` writes an `OAuthHandoff` record keyed by `state`; Safari lands on `/oauth/callback/success` ("Authorization Successful").
6. Desktop polls `GET /oidc/handoff?id=<state>&client=desktop` → gets `code` → `POST /oidc/token` (PKCE) → `saveTokens` → `setRemoteServerConfig({active:true})` → broadcasts `authorizationSuccessful` → renderer routes to the post-onboarding target (`/tasks?onboarding=task`).

### Persistence

- `electron-dev.sh login-status` reads the golden profile `~/Library/Application Support/orvilo-desktop-dev`.
- `save-login <id>` is **only for pool instances**, not the golden profile — the golden profile persists the refresh token itself (access token \~167 h). A future `electron-dev.sh start` boots signed in.
- There is **no** `@IpcMethod`-decorated IPC that accepts raw tokens (`saveTokens` is not registered) — you cannot inject a session via `electronAPI.invoke`; the OIDC drive is the only scripted path.

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

- `computer` `type` action drops/mangles `@` and `/` — use `printf '...' | pbcopy` + Cmd+V for emails/URLs (this applies to Safari fields too).
- In-app Electron navigation: `agent-browser --cdp 9222 open 'app://renderer/...'` → `ERR_NAME_NOT_RESOLVED`. Use `eval "location.assign('app://renderer/onboarding')"` instead.
- Electron renderer probes must import via the `app://renderer/src/…` module graph — `import('http://localhost:5173/src/…')` resolves a **separate** module instance, so store reads/emits through it are phantom.
- Pool instances (`electron-dev.sh start <id>` → ipcId namespaced `ORVILO_IPC_ID=…-9`) diverge on `useWatchBroadcast`/remote-config wiring — an invalid rig for auth-flow tests; use the legacy default-profile instance.
- Post-auth renderer can show garbled i18n keys for a beat while lazy namespaces load — resolves itself.
- Import probes via the Next port fail (module not served there) — always import from the Vite origin; both windows share the same module instance.
- Agent-browser `open` right after seeding can race the auth redirect; `status --surface web` is the source of truth, retry the open.
- The seeded `agent-browser` daemon is headless (`--headless=new`) → `recording_start`/`annotate_recording` capture only the desktop. For recordable evidence launch a headed Chrome per test user and attach:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9333 --user-data-dir=/tmp/q0-chrome-owner --no-first-run "http://localhost:<next-port>"`, then `agent-browser --session X connect 9333`. Transplant auth with `agent-browser --session X cookies set better-auth.session_token <value> --url http://localhost:<port>` (value from `cookies` on the seeded session, or from `POST /api/auth/sign-in/email`). `document.visibilityState` goes `hidden` when the window is fully occluded — raise the target window (`osascript -e 'tell application "System Events" to tell (first process whose unix id is <pid>) to set frontmost to true'`) before focus/visibility probes.
- tRPC from the shell: `POST http://localhost:<next-port>/trpc/lambda/<proc>` body `{"json":{…}}`; GET + `?batch=1&input=…` also works for queries. There is no `/api/trpc` — the router lives in the `(backend)` route group.
- `lh connect -d` registers a device row, but the gateway `wss://device-gateway.aspectlylabs.com` is unreachable from this box → device stays `offline`. Offline devices still exercise web quota/execution surfaces through the persisted-fallback path; live-consult responses can be stubbed at the browser with CDP `Fetch.fulfillRequest` (see below).
- Multi-user workspace fixtures: invitee signup via `POST /api/auth/sign-up/email`; the invite token ships only by email and `workspace_invitations` stores only `token_hash` — mint locally with `UPDATE workspace_invitations SET token_hash='<sha256hex of chosen raw token>'`. API-created users have `users.email_verified=false` → invite accept is blocked by "Verify your account email" until you `UPDATE users SET email_verified=true`. `lh ws invite` may return UNAUTHORIZED under the API-key credential — the owner's web UI Invite modal works.
- Quota surface fixtures (web): set `agents.agency_config` to `{"heterogeneousProvider":{"type":"claude-code","authMode":"subscription"},"executionTarget":"device","boundDeviceId":"<registered offline device id>"}`; seed `agent_provider_accounts` (provider `claude-code`, `external_account_id`) + `agent_quota_snapshots` rows. With a bound device the menu only paints persisted rows after a live consult proves identity (`trustedDeviceAccounts`) — stub `device.getClaudeCodeQuota` via CDP `Fetch.fulfillRequest` returning `[{"result":{"data":{"json":{…ClaudeCodeQuotaSnapshot…}}}}]` with `identity.externalAccountId` matching the seeded account. For the focus-park regression use `Fetch.requestPaused` + `Fetch.continueRequest` after a delay on `agentQuota.*`; count calls by continuing unmatched requests and tallying the log.
