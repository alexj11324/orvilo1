---
name: acceptance-dockerless-env
description: Run the local acceptance environment without Docker (brew Postgres + pgvector + Redis), pg_search marker-row workaround, Electron/CDP + agent-browser auth flow, personal-scope forcing for provider_bindings testing, and known gotchas for this repo's .agents/acceptance scripts.
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

## Fast path: `dev-up.sh`

For a worktree that already has a `.env`, `.agents/acceptance/scripts/dev-up.sh` is the
one-command bring-up — it ensures Postgres/Redis are up, runs `bun run db:migrate`,
reuses a live dev server (detected via `.next/dev/lock`) or spawns `bun run dev` under
`nohup` (log at `.records/env/dev-server.log`), and prints the Next + Vite URLs.
Subcommands: `status`, `stop`, `restart`, `logs`. Prefer this over hand-running
`bun run dev` — the orchestrator aborts when an instance is already up, and the
half-started vite it spawns dies with it.

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

- **Clerk-era web session (post `feat/remove-better-auth`)**: sign-in lives on the accounts portal (`AUTH_ACCOUNTS_URL || https://accounts.aspectlylabs.com`). `/signin`/`/signup`/`/verify-email`/`/reset-password` are public bounce routes — the auth SPA `window.location.replace`s to `<portal>/login?return_url=<origin+callbackUrl>` (forwards `sign_out`/`reason`/`hl`). Local sign-in via the portal's email+password cannot finish locally because `POST /api/auth/clerk` needs `CLERK_SECRET_KEY`; without it the exchange 500s at the Clerk Backend API check (`assertClerkSessionActive`/`fetchClerkUser`), while signature failures correctly 401.
- **Seeding a web session locally**: insert a `users` row (`id`, `email`, `normalized_email`, `username`, `full_name`, `email_verified=true`, `onboarding={"finishedAt":...,"version":1}` jsonb, `created_at`/`updated_at`/`last_active_at`) then `INSERT INTO auth_sessions (id, token, user_id, expires_at, created_at, updated_at)` with a random token and future `expires_at` — mirror `e2e/src/support/seedTestUser.ts createTestSession()`. Set cookie `orvilo_auth=<token>` (CDP `Network.setCookie` or `document.cookie`; `Secure` not needed on localhost). `GET /api/auth/session` returns 200 `{"user":{...}}` when valid, 401 `{"error":"unauthorized"` otherwise; legacy `<prefix>.session_token` (default `better-auth.session_token`) is dual-read from the same `auth_sessions` rows. `POST /api/auth/signout` deletes the row and clears both cookies; expired tokens are 401 + row-deleted on read.
- `setup-auth.sh web-seed` on Clerk-era branches inserts an `auth_sessions` row for `SEED_EMAIL` and injects the `orvilo_auth` cookie (needs `DATABASE_URL`; run `init-dev-env.sh seed-user` first). On pre-migration branches it POSTed the removed `/api/auth/sign-in/email` and harvested `better-auth.*` cookies — use the auth_sessions insert above there.
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

## Logged-in reference browser (Brave profile copy + CDP)

To inspect a **logged-in** third-party reference app (e.g. `linear.app`) when the user's real session is required: do NOT use the chrome-devtools MCP scratch Chrome (clean profile, logged out) and do NOT resurrect stale temp profiles. Copy the user's real Brave `Default` profile to a temp dir and launch a second Brave instance with its own CDP port. The "Brave Safe Storage" cookie key lives in macOS Keychain keyed to the Brave binary, so the copy still decrypts cookies and keeps login.

```bash
SRC="$HOME/Library/Application Support/BraveSoftware/Brave-Browser"
DST=/tmp/linear-ref-brave # any temp dir; use a per-task name

# 1) Which profile holds the login? (reads host_key only, never cookie values;
#    immutable=1 reads Cookies while the real Brave is running)
sqlite3 "file:$SRC/Default/Cookies?immutable=1" \
  "select count(*) from cookies where host_key like '%linear%';"
# -> >0 means logged in; check "Profile N" dirs the same way if Default is empty.

# 2) Copy the profile minus heavy caches (verified 2026-09-22: 2.1G -> ~1.5G)
mkdir -p "$DST/Default"
cp "$SRC/Local State" "$DST/"
rsync -a \
  --exclude='Cache/' --exclude='Code Cache/' --exclude='GPUCache/' \
  --exclude='Service Worker/' --exclude='blob_storage/' --exclude='File System/' \
  --exclude='Crashpad/' --exclude='ShaderCache/' --exclude='GrShaderCache/' \
  --exclude='DawnGraphiteCache/' --exclude='DawnWebGPUCache/' \
  --exclude='GraphiteDawnCache/' --exclude='Sessions/' \
  --exclude='Segmentation Platform/' --exclude='Safe Browsing/' \
  --exclude='shared_proto_db/' --exclude='Trusted Vault/' \
  --exclude='Optimization Guide*/' \
  "$SRC/Default/" "$DST/Default/"

# 3) Launch a SECOND Brave instance on the copy — safe while the real Brave runs
#    (separate user-data-dir; Singleton* locks live at the dir root and are not copied)
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  --user-data-dir="$DST" --remote-debugging-port=9666 \
  --no-first-run --no-default-browser-check --disable-session-crashed-bubble \
  "https://linear.app/<workspace>/<route>" &

# 4) Verify the page target is the real app, not a login/interstitial page
curl -s http://127.0.0.1:9666/json/list
```

Rules:

- Read-only on the reference: navigate and `Runtime.evaluate`; never create/edit/delete in the real workspace.
- One agent per tab; tab ids change on restart — always rediscover via `/json/list`.
- The copied profile goes stale as cookies rotate; re-copy into a fresh DST when login expires — never rsync into a DST a running instance is using.
- Keep localStorage/IndexedDB/Cookies/Login Data/Preferences in the copy — they carry session state; only exclude caches.
- Verified endpoint: `http://127.0.0.1:9666` → `linear.app/bdiverifier/inbox` rendered logged-in ("Inbox (30)").

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
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9333 --user-data-dir=/tmp/q0-chrome-owner --no-first-run "http://localhost:<next-port>"`, then `agent-browser --session X connect 9333`. Transplant auth with `agent-browser --session X cookies set orvilo_auth <auth_sessions.token> --url http://localhost:<port>` (token from a seeded `auth_sessions` row — see Auth & surfaces; the removed `POST /api/auth/sign-in/email` no longer mints cookies). `document.visibilityState` goes `hidden` when the window is fully occluded — raise the target window (`osascript -e 'tell application "System Events" to tell (first process whose unix id is <pid>) to set frontmost to true'`) before focus/visibility probes.
- tRPC from the shell: `POST http://localhost:<next-port>/trpc/lambda/<proc>` body `{"json":{…}}`; GET + `?batch=1&input=…` also works for queries. There is no `/api/trpc` — the router lives in the `(backend)` route group. Workspace-scoped procedures (e.g. `connector.list`) additionally need `-H "X-Workspace-Id: <workspace id>"`; without it they return the personal-scope result (`[]`), which is correct — not a bug.
- Inspect zustand stores in the page: `window.__ORVILO_STORES.<name>()` is a getter returning live state (e.g. `__ORVILO_STORES.tool().connectors`, `.isConnectorsInit`); store entries are functions, not objects — call them.
- OAuth popups need a real user gesture: synthetic `el.click()`/`dispatchEvent` in `agent-browser eval` does NOT count → `window.open` gets popup-blocked and the flow throws `OAuth popup was blocked` with only a transient toast. Use real `computer` clicks (e.g. DevModal's mid-form "Authorize & Connect" ≈ (562,427) after scrollIntoView) — the popup then opens to the provider authorize URL.
- CustomConnectorModal DOM hooks: identifier `#identifier`, MCP URL `#customParams_mcp_url`, bearer token `#customParams_mcp_auth_token`; auth radios labeled "No auth"/"API Key"/"OAuth"; footer submit is "Install", the mid-form button is "Authorize & Connect" (oauth2) or "Test connection" (non-oauth). Give the modal \~3s to mount before `fill` or the element isn't found.
- Public no-auth MCP endpoints for real create→sync→connected flows: `https://mcp.deepwiki.com/mcp` (tools: ask_wiki_question, read_wiki_structure, read_wiki_contents). `https://api.githubcopilot.com/mcp/` and `https://mcp.linear.app/mcp` return 401 unauthenticated — usable only as a reachable auth boundary, not for sync. Non-oauth creates run a sync and roll back on failure, so the endpoint must really work.
- Connector list after a hard reload into a `/ws-*/settings/connector` URL can come back empty even though rows exist: a personal-scope `connector.list` can latch `isConnectorsInit=true` before `activeWorkspaceId` resolves, and no refetch follows. Workaround for testing: `await __ORVILO_STORES.tool().fetchConnectors()` or trigger any mutation refresh; treat a persistent empty list as the scope-race, not missing data — verify with `X-Workspace-Id` curl before suspecting the DB.
- Respawn the web dev server with env, not `dev-up.sh`/`bun run dev`: `dev-up.sh` only works when the worktree has a `.env`. In the no-.env acceptance setup (guard_no_root_env), spawning `bun run dev` binds the default :3010 and crashes `KEY_VAULTS_SECRET is not set`. Use `export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres REDIS_URL=redis://localhost:6379 DB_PORT=5432 REDIS_PORT=6379 ALLOC_SERVER_PORT=<port> ALLOC_SPA_PORT=<port>` + `nohup .agents/acceptance/scripts/init-dev-env.sh dev > /tmp/initdev.log 2>&1 &` (apply_env supplies KEY_VAULTS_SECRET/JWKS; ports come from `.records/env/agent-testing-ports.env`).
- Stale Turbopack graph after branch checkout under a running dev server: pages 500 with `module factory is not available` for changed `packages/*` imports — `next dev` does not pick up workspace-package edits. Full restart via the recipe above fixes it; a stale agent-browser `open` failure (ERR_HTTP_RESPONSE_CODE_FAILURE) is usually this, not auth.
- `orvilo connect -d` registers a device row, but the gateway `wss://device-gateway.aspectlylabs.com` is unreachable from this box → device stays `offline`. Offline devices still exercise web quota/execution surfaces through the persisted-fallback path; live-consult responses can be stubbed at the browser with CDP `Fetch.fulfillRequest` (see below).
- Multi-user workspace fixtures: invitee signup via `POST /api/auth/sign-up/email`; the invite token ships only by email and `workspace_invitations` stores only `token_hash` — mint locally with `UPDATE workspace_invitations SET token_hash='<sha256hex of chosen raw token>'`. API-created users have `users.email_verified=false` → invite accept is blocked by "Verify your account email" until you `UPDATE users SET email_verified=true`. `orvilo ws invite` may return UNAUTHORIZED under the API-key credential — the owner's web UI Invite modal works.
- Quota surface fixtures (web): set `agents.agency_config` to `{"heterogeneousProvider":{"type":"claude-code","authMode":"subscription"},"executionTarget":"device","boundDeviceId":"<registered offline device id>"}`; seed `agent_provider_accounts` (provider `claude-code`, `external_account_id`) + `agent_quota_snapshots` rows. With a bound device the menu only paints persisted rows after a live consult proves identity (`trustedDeviceAccounts`) — stub `device.getClaudeCodeQuota` via CDP `Fetch.fulfillRequest` returning `[{"result":{"data":{"json":{…ClaudeCodeQuotaSnapshot…}}}}]` with `identity.externalAccountId` matching the seeded account. For the focus-park regression use `Fetch.requestPaused` + `Fetch.continueRequest` after a delay on `agentQuota.*`; count calls by continuing unmatched requests and tallying the log.

## Forcing personal scope (provider settings / bindings plane testing)

The seeded app auto-provisions a workspace on first load
(`useWorkspaceUrlSync` → `workspace.ensureDefault`), so `X-Workspace-Id` is
always sent. Provider settings credentials are personal by design — new writes
land on the bindings plane regardless of workspace presence — but a workspace
context still pulls shared `ai_providers`/`ai_models` rows into the dual-read
overlay (and historically diverted writes to the legacy plane entirely). To
exercise the clean personal-scope path — no workspace overlay, no shared
legacy rows — remove the workspace and block re-provisioning:

```sql
DELETE FROM ai_providers;                       -- stray workspace-scoped rows
DELETE FROM workspace_members;
DELETE FROM workspaces;
CREATE FUNCTION block_workspace_insert() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'workspace provisioning disabled for this test'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER block_ws_insert BEFORE INSERT ON workspaces
  EXECUTE block_workspace_insert();
```

Then cold-boot at `/` (the `workspaceContextStore` is deliberately NOT
persisted; `activeWorkspaceId` stays null → no `X-Workspace-Id` header →
personal scope). Bottom-left should read "Personal space".

Cleanup when done so the env returns to normal:

```sql
DROP TRIGGER block_ws_insert ON workspaces;
DROP FUNCTION block_workspace_insert();
```

## Verifying provider settings writes landed on the bindings plane

```sql
-- anchor row: model='__provider_config__' carries providerSettings
-- (enabled, name, source, fetchOnClient, settings, config);
-- route rows: one per enabled model (config->>'model' = modelId)
SELECT config->>'provider', config->>'model', config->>'enabled',
       config->'providerSettings'->>'enabled'
FROM provider_bindings ORDER BY 1,2;

-- per-provider credential row (apiKey/baseURL land here, encrypted)
SELECT key, name, type FROM credentials
WHERE key = 'provider-binding:<providerId>';   -- type 'kv-env'

-- invariant: writes create no NEW ai_providers rows
-- (pre-existing legacy rows may still exist — they are dual-read)
SELECT count(*) FROM ai_providers;
```

Semantics to expect:

- `setProviderEnabled(false)` keeps route rows with `enabled=false`;
  `setModelEnabled(false)` DELETES the model's route row.
- `ai_models` is still the model registry plane — a disabled model keeps an
  `enabled=f` row there (not a failure).
- List overlay ORs deployment force-enable over the binding flag
  (`enabled: anchorItem.enabled || item.enabled` in
  `repositories/aiInfra/index.ts`), so deployment-enabled providers
  (e.g. ollama, deepseek, or any provider whose `*_API_KEY` env var is set in
  the dev server env) CANNOT be disabled from the UI — pick a provider that
  is not force-enabled (e.g. xAI) for toggle tests.

## Real-Postgres live-path harness for backend PRs (no dev server, no Hatchet)

When a PR's surface is backend-only (tRPC procedures, services, DB models), the
fastest end-to-end check is a scratch vitest spec driven against a real local
Postgres — full production code path, real SQL, durable row evidence.

1. **DB**: brew Postgres on :5432. Create a scratch DB, run
   `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<db> bun run db:migrate`
   (pg_search gap: apply the sandwiched non-pg_search .sql files by hand and give
   them their own marker rows — the migrator uses a single `max(created_at)`
   watermark, so marking a later migration first permanently skips earlier ones).
2. **Spec placement**: must live under `apps/server/**` to match the root
   `vitest.config.mts` `|server|` project (its include is `**/apps/server/**/*.test.ts`).
   Run:
   `TEST_SERVER_DB=1 DATABASE_TEST_URL=postgresql://... DATABASE_URL=postgresql://... bunx vitest run --project server <file>`
   `TEST_SERVER_DB=1` flips `packages/database/src/core/getTestDB.ts` to
   node-postgres (assertTestDatabaseUrl accepts `localhost`) and runs
   `nodeMigrate` — a no-op on an already-migrated DB. Seed with drizzle inserts
   using `@/database/schemas` table objects.
3. **tRPC procedures**: `createCallerFactory(<router>)(await createContextInner({userId}))`
   from `@/libs/trpc/lambda` + `@/libs/trpc/lambda/context`. No `workspaceId` →
   personal mode: `cloudWorkspaceAuth` passes membership:null and
   PERSONAL_DEFAULT_PERMISSIONS grant `*:owner` codes (e.g. `agent:update:owner`).
   **Pitfall**: `getDBInstance()` returns `{}` when `NODE_ENV==='test'`, so the
   real `serverDatabase` middleware gets a dead handle
   (`this.db.select is not a function`). Fix by mocking only the adaptor, not the
   chain:
   ```ts
   vi.mock('@/database/core/db-adaptor', async () => {
     const { getTestDB } = await import('@/database/core/getTestDB');
     const db = await getTestDB();
     return { getServerDB: () => Promise.resolve(db), serverDB: {} };
   });
   ```
   Zod input validation, RBAC, the resolver and the model then all run for real;
   `BAD_REQUEST` on invalid enum input is exercised at the real input layer.
4. **Services**: orchestration sweeps like `sweepTaskBacklogIntake({db})` are
   plain exported functions — call them directly; `findBacklogIntakeCandidates`,
   `resolveBacklogIntakeAssignment`, `TaskDispatchModel.request/settle` are all
   real over PG. To escalate: `model.settle({phase:'failed', fence, generation,
expected:[<current phase>]})` is the same transition the runtime callback uses.
5. **Boundary you'll see locally**: with no agent runtime admission
   (`caid_dispatch` flag off), prepared dispatches park `phase='waiting'`,
   `waiting_reason='caid_dispatch_disabled'`, sweep outcome `'waiting'` —
   never `'started'`. The durable artifacts (assignee rebind via
   `updateWithLog`, `task_dispatches` rows with `requested_by='orchestrator:…'`,
   tier snapshots, generation bumps) still persist and are the evidence;
   actual agent execution needs a live runtime (Hatchet + CAID) elsewhere.
6. vitest suppresses `console.log` for passing tests — write evidence rows to a
   file (`fs.writeFileSync('/tmp/evidence.json', ...)`) or snapshot them via
   `psql -P pager=off` after the run instead of relying on stdout.

## Broken `pnpm install` on this box (as of Oct 2026)

`pnpm install` fails: the registry lacks `@aws-sdk/token-providers@3.1145.0` (and the
lockfile pins it). Root `node_modules` ends up partially populated and `apps/server`
has none. Symptoms at Vite dev time are sequential `Failed to resolve import "X"`
500s — each fix reveals the next missing package, and a stale `node_modules/.vite`
deps bundle can keep serving the old failure until you clear it AND restart dev.

Workaround that got a working SPA + in-process server:

```bash
mkdir -p /tmp/missdeps && cd /tmp/missdeps
npm install --no-save --legacy-peer-deps \
  sonner@2.0.8 react-day-picker@10.0.2 @date-fns/tz \
  @dnd-kit/modifiers @tanstack/react-table @tanstack/react-virtual \
  date-fns@4 embla-carousel embla-carousel-react use-sync-external-store \
  tslib scheduler
cp -R node_modules/* ~/repos/orvilo1/node_modules/ # merge, don't replace
# workspace packages that never got linked:
ln -sfn ~/repos/orvilo1/packages/agent-runtime \
  ~/repos/orvilo1/node_modules/@orvilo/agent-runtime
rm -rf ~/repos/orvilo1/node_modules/.vite # force re-optimize
# then restart the dev server — clearing .vite alone is NOT enough
```

Note: a second `import()` of a failed module inside the same document returns the
cached rejection with NO new network request — always reload + capture Network
events (Page.reload ignoreCache) to find the real 500 module.

## APP_URL override for `init-dev-env.sh dev`

If the environment leaks `APP_URL=http://localhost:3010` (a platform secret), dev
signin bounces to a dead port. Restart with the real Next port, e.g.
`APP_URL=http://localhost:37789 .agents/acceptance/scripts/init-dev-env.sh dev`.

## Hetero "Cloud credentials required" guard

`useHeteroAgentCloudConfig` blocks hetero sends until the agent advertises a creds
env var. No real token is needed — presence of the env key is enough:

```sql
UPDATE agents SET agency_config = agency_config ||
  '{"heterogeneousProvider":{"type":"claude-code","env":{"CLAUDE_CODE_CRED_KEY":"dummy"},"apiMode":"local"}}'::jsonb
WHERE id='<agent-id>';
```

Nested `jsonb_set` on a missing path silently no-ops — use the `||` jsonb merge.

## PG17 trigger syntax + workspace auto-provision crash

- `CREATE TRIGGER ... EXECUTE FUNCTION f()` (not `EXECUTE PROCEDURE`) on PG17.
- The `block_ws_insert` workspaces trigger from older notes CRASHES
  current-branch boot: `workspace.ensureDefault` 500s → React error boundary.
  Drop it and let the app auto-provision the workspace on first load instead;
  seed test rows into that auto-created workspace id.

## Server-side dispatch testing without the desktop app

The web composer's send is two tRPC calls: `aiChat.sendMessageInServer` (persists
messages, \~30ms) then `aiAgent.execAgent` (the actual dispatch, \~300ms+). Calling
only the first silently strands the turn — no op, no error. To drive a server
dispatch from the authenticated page (e.g. when a client guard like
"Device not connected" blocks the send button):

```js
fetch('/trpc/lambda/aiAgent.execAgent', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'X-Workspace-Id': '<ws-id>',
  },
  body: JSON.stringify({
    json: {
      agentId: '<a>',
      prompt: '...',
      appContext: { topicId: '<t>' },
      clientIds: { userMessageId: 'msg_x1', assistantMessageId: 'msg_x2' },
      trigger: 'chat',
    },
  }),
});
```

- `X-Workspace-Id` is REQUIRED for workspace-scoped topics — without it the
  server resolves personal scope and execAgent fails "Topic not found".
- `clientIds` rows must not already exist (409 "already been created").
- Blocked admissions return 200 with `error` in the payload and land the honest
  error on `messages.error` + `agent_operations` (`status='error'`); resolved
  device dispatches write `metadata.executionPlan` + `metadata.remoteAdmission`
  before the gateway call.

## Device admission fixture shape

`topics.metadata.executionConfig` must snapshot BOTH `executionTarget` and
`boundDeviceId` (what `snapshotTopicExecutionConfig` writes). A config with only
`boundDeviceId` applies `executionTarget: undefined` onto the agent and blocks
with EXECUTION_TARGET_NONE before the pin is ever evaluated. The session pin
admission consults comes from the topic's applied `boundDeviceId`; the raw
`deviceId` request param is the explicit-request slot; for a NEW topic the raw
deviceId BECOMES the session pin (so a rogue id blocks as DEVICE_BINDING_INVALID,
not DEVICE_REQUEST_UNAUTHORIZED — use an existing unpinned topic for the latter).

## Known flaky symptom: eternal "Task is running" after instant-finalize

When a dispatch fails in <100ms (e.g. GATEWAY_NOT_CONFIGURED), the topic can be
left with `topics.status='running'` and both surfaces show an eternal
"Task is running in the server" banner even though `agent_operations` is `error`,
`messages.error` is set, and `agent_runtime_end` was published to the Redis
stream. The client op store never sees the terminal state in the local env —
verify terminal state in Postgres/Redis, not the banner.
