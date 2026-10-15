# Local setup

Development and UI acceptance default to real Electron with the existing local
backend. Use `bun run dev:desktop:skip-login` for an isolated Electron profile
already signed in as the seed user; no repeated local-backend selection is needed.
Local verification proves the selected local environment. Cloud-specific acceptance
uses real cloud identity and records the cloud deployment revision separately.

The supported way to run Orvilo on your machine. A repo-root `.env` always
wins — if one exists, `init-dev-env.sh` refuses to run; use the existing config
and start normally (`bun run dev`).

## Prerequisites

- Repo toolchain: `bun` (runs scripts), `pnpm` (installs deps), Node.js. Run
  `pnpm install` first.
- PostgreSQL + Redis, one of:
  - **brew (dockerless — the no-Docker path)**
    ```bash
    brew install postgresql@17 pgvector redis
    brew services start postgresql@17 redis
    createdb orvilo
    ```
  - **Docker**: `init-dev-env.sh setup-db` starts a `paradedb/paradedb`
    container on `:5433` and Redis on `:6380`. The standalone e2e bootstrap
    (`e2e/scripts/setup.ts`, `postgres-e2e` container) uses the same image.

## Bootstrap

`.agents/acceptance/scripts/init-dev-env.sh` is the whole loop:

| Command                           | What it does                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `env` / `write [file]`            | Print shell exports / write a source-able env file under `.records/env/`                               |
| `setup-db`                        | Start Postgres + Redis via Docker — skip on the brew path; export `DATABASE_URL` / `REDIS_URL` instead |
| `migrate`                         | `bun run db:migrate` against `DATABASE_URL`                                                            |
| `seed-user`                       | Baseline test user + CLI API key                                                                       |
| `s3`                              | Local s3rver object storage                                                                            |
| `preflight`                       | Hatchet + S3 prerequisite check                                                                        |
| `dev` / `dev-next`                | Exec `bun run dev` / `pnpm run dev:next` with this env                                                 |
| `stop-dev`                        | Stop the dev server started by `dev`                                                                   |
| `clean` / `clean-s3` / `clean-db` | Teardown (`clean` keeps DB/Redis/S3 data)                                                              |

The script writes its resolved env to `.records/env/agent-testing-dev.env`
(generated):
`APP_URL`/`PORT` 3010, `VITE_DEV_PORT`/`SPA_PORT` 9876, Postgres
`localhost:5432` db `orvilo`, Redis `:6379`, mock LLM `:3406`, mock gateway
`:3407`, and local S3 mock credentials. When 3010/9876 are taken the server and
SPA ports are auto-allocated and persisted in
`.records/env/agent-testing-ports.env` — read that file for the actual ports.

A hand-rolled `.env` is the alternative: copy `.env.example.development` — same
contract (APP_URL 3010, `orvilo` DB, Redis 6379, S3 mock) — and the bootstrap
steps aside because a root `.env` exists.

## Run modes

| Command                            | Starts                                                                                                                                                                                                                                     | Port                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `bun run dev`                      | Next.js + Vite SPA + Clerk accounts portal concurrently (full stack)                                                                                                                                                                       | app 3010, SPA 9876, auth 3018                               |
| `bun run dev:spa`                  | Vite SPA only; proxies API calls to `localhost:3010` and prints a Debug Proxy URL for developing against the production backend                                                                                                            | 9876                                                        |
| `bun run dev:desktop:skip-login`   | Next.js behind the Clerk stub, the local device gateway, the local Agent Gateway, and Electron with an isolated temporary profile; signs the local seed user in (renderer and main process) and points Next and Electron at those gateways | app 3010, CDP 9263, device gateway 8787, Agent Gateway 8788 |
| `pnpm --filter @orvilo/server dev` | Standalone Hono backend service                                                                                                                                                                                                            | —                                                           |
| `bunx next start`                  | Production build serve (after `bun run build`)                                                                                                                                                                                             | 3010 (`-p` to override)                                     |

**`bun run dev` derives local auth URLs from its selected ports.** It sets
`APP_URL` and `INTERNAL_APP_URL` to the selected Next origin, then starts the
accounts portal on `AUTH_SPA_PORT_RR` (first free port from 3018 by default).
`AUTH_ACCOUNTS_URL` and `CLERK_AUTHORIZED_PARTIES` use that exact portal origin;
`AUTH_API_PROXY` and `VITE_PORTAL_PRODUCT_ORIGIN` use the Next origin. All use
literal `localhost`. An explicit port is used as requested; a busy explicit
portal port fails instead of silently changing the login destination.

For other server commands, **`APP_URL` is read at runtime**: its port must match
the listener, because sign-in and OIDC callbacks use it. `dev:spa` retains its
existing production Debug Proxy workflow; it does not run local full-stack auth.

## Seeds — which env gets which

| Environment          | Seed                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local dev            | `init-dev-env.sh seed-user` — always; creates `agent-testing@orvilo.aspectlylabs.com` / `TestPassword123!` plus a CLI API key. Opt-in: `bun run workflow:seed-linear-parity` — the Linear-parity fixture, hard-guarded by `ORVILO_PARITY_SEED_TARGET=local`, writes only to the dedicated DB `orvilo_linear_parity_20260922` (see `scripts/seedLinearParity/README.md`). |
| CI / e2e             | Deterministic fixtures built per run by the workflows and the e2e support code — nothing shared between runs.                                                                                                                                                                                                                                                            |
| Staging / production | None.                                                                                                                                                                                                                                                                                                                                                                    |

## Sign in

Normal local sign-in uses the existing Clerk **development instance**. Supply
these two keys from the same instance through your existing secret workflow
or development environment configuration (the examples below are placeholders):

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_<development-publishable-key>
CLERK_SECRET_KEY=sk_test_<development-secret-key>
# Optional: derived from publishable-key metadata when absent.
CLERK_ISSUER=https://<development-frontend-api-host>
```

Enable Google on that instance using Clerk's shared development credentials, or
its already-configured development Google connection. Existing Clerk projects
should retain their application and keys; do not run `clerk init` to replace them.
The publishable key metadata and any declared issuer must agree. Startup rejects
missing keys, malformed publishable keys, live keys, or mismatched issuers before starting servers,
with errors naming only the variables. It checks configuration locally; it does
not authenticate the secret key against Clerk's API.

Run `bun run dev` and open the printed Next URL. `/signin` redirects to the
printed local accounts portal. Google authentication returns through its
`/login` route, which exchanges the Clerk token at local `/api/auth/clerk` before
returning to the product. The resulting host-only `orvilo_auth` cookie retains
Secure, HttpOnly and SameSite=Lax; local startup clears `AUTH_COOKIE_DOMAIN` in
child processes. It also clears an inherited `CLERK_JWT_KEY` in child processes,
so token verification uses the selected development issuer's JWKS rather than a
parent instance's static public key. Reload should retain the session, and `/api/auth/session`
should report the signed-in user. Normal Electron sign-in uses this same local
server and the existing browser/PKCE callback flow.

To sign a local Electron instance in as the seed user without the portal, run
the dev server behind the local Clerk stub and seed a session:

```bash
ORVILO_CLERK_STUB=1 .agents/acceptance/scripts/dev-up.sh restart
DATABASE_URL=... node .agents/acceptance/scripts/seed-session.mjs --electron <cdpPort>
```

The stub (`clerk-stub.mjs`) listens on loopback only, vouches for seed sessions
and forwards every other Clerk Backend call unchanged, so a normal sign-in on
the same server still works. It refuses to start with `NODE_ENV=production`.

This path needs no Clerk keys, so a fork without access to a Clerk instance can
still develop: when the publishable key is unset, `dev-up.sh` fills in a
placeholder with its matching `CLERK_ISSUER`, and an unset secret key gets one too. Only seed sessions can sign in then; the
sign-in page needs a real development instance.

`bun run dev:desktop:skip-login` does all of this in one command: it starts the
stub, a local device gateway that trusts the same `JWKS_KEY`, the Next.js
server and Electron on a temporary profile, then signs the seed user in, main
process included, and points Next and Electron at that gateway. It does not
use `device-gateway.aspectlylabs.com`. It preserves `CLERK_SECRET_KEY` from the
shell or `.env`; when absent, a local stub-only placeholder lets the server
check seeded sessions. Normal Clerk sign-in still requires a real key.
When `JWKS_KEY` is absent, it reuses `.records/env/agent-testing-jwks.json` or generates and privately saves a local signing key there without changing `.env`.
`bun run dev:desktop:login-local` signs an
Electron instance that is already running in (CDP port from
`ORVILO_DESKTOP_CDP_PORT`, default 9263). Both read `DATABASE_URL` from `.env`
when the shell does not set it, and need the seed user to exist.

If the renderer is already on `/onboarding`, that is the signed-out boot path,
not a handoff to a person. Read the live CDP port (for example
`http://127.0.0.1:<port>/json/version`), set `ORVILO_DESKTOP_CDP_PORT` to it, and
run `bun run dev:desktop:login-local` when that Electron is already aimed at the
local stubbed server and already using the local device gateway. `login-local`
cannot change the gateway URL of a process that is already running; if that
Electron is still pointed at the production gateway, start it with
`bun run dev:desktop:skip-login` instead. Use `bun run dev:desktop:skip-login`
only when you intend to start the local stack. Do not reload the page to
recover a session. Do not use either command to recreate a cloud workspace that
the lost session was viewing: a slug that existed only against
orvilo.aspectlylabs.com does not come back. Do not switch backends and treat
the new page as the same candidate.

A seeded renderer session does **not** authorize the Electron main process or
connect an execution device. To do that as well without signing in by hand,
start Electron with `ORVILO_DESKTOP_AUTH_URL_FILE=<file>` and pass the same path:

```bash
DATABASE_URL=... node .agents/acceptance/scripts/seed-session.mjs --electron <cdpPort> --desktop-auth <file>
```

A development build then writes its authorization request to the file and opens
no browser; the script completes it with the seeded session and waits until the
main process has an access token. It does not verify gateway reachability or a
connected execution device. A packaged build ignores the variable. For real local-agent requests, follow
[Electron real-model integration](./electron-real-model.md).

## Running Issues on this machine (device gateway)

An Issue run reaches your computer through the device gateway. Packaged desktop
builds connect to the hosted gateway (`device-gateway.aspectlylabs.com`), which
trusts only tokens signed by production. A local dev server signs with its own
`JWKS_KEY`, so that hosted gateway will not accept a local token.

`bun run dev:desktop:skip-login` starts a device gateway that trusts the local key,
points Next and Electron at `http://localhost:8787`, and fails if that gateway
does not come up. It also starts the local Agent Gateway on `http://localhost:8788`
and sets `ENABLE_AGENT_GATEWAY`, `AGENT_GATEWAY_URL`, and
`AGENT_GATEWAY_SERVICE_TOKEN` on Next. Sending a message needs that Agent Gateway;
the device gateway only connects this computer. It does not fall back to the
production gateways. The e2e mock on port 3407 is a separate test double and is
not either of these processes.

To start the gateway on its own (for a stack that is not using skip-login), use
the same script skip-login calls. The gateway is a separate Go service kept in
the public repository [`alexj11324/orvilo-gateway`](https://github.com/alexj11324/orvilo-gateway)
(the same commit production builds from):

```bash
# 1. Gateway, in its own terminal. JWKS_KEY is the value the dev server runs with.
JWKS_KEY=... .agents/acceptance/scripts/agent-gateway/local-device-gateway-setup.sh start

# 2. Point the dev server at it before starting it.
eval "$(.agents/acceptance/scripts/agent-gateway/local-device-gateway-setup.sh env)"

# 3. Start Electron with the same gateway address.
DEVICE_GATEWAY_URL=http://localhost:8787 .agents/acceptance/scripts/electron-dev.sh start <id>
```

It needs `go` and `git`. The service token is generated once into `.records/env/device-gateway.token` and is never printed. A seeded renderer session is not enough to connect this machine: the desktop main process needs its own access token, which `skip-login` already completes.

## Ports

| Port | Service                                                  |
| ---- | -------------------------------------------------------- |
| 3010 | Next.js app (`APP_URL`)                                  |
| 3018 | Local Clerk accounts portal (`AUTH_SPA_PORT_RR`)         |
| 9876 | Vite SPA dev                                             |
| 5432 | Postgres (brew / `.env.example.development` `orvilo` DB) |
| 6379 | Redis                                                    |
| 3406 | Mock LLM (OpenAI-compatible, e2e)                        |
| 3407 | Mock agent gateway (e2e)                                 |
| 8787 | Local device gateway (`dev:desktop:skip-login`)          |
| 8788 | Local Agent Gateway (`dev:desktop:skip-login`)           |

The Docker e2e path uses different ports on purpose — app `:3006`, Postgres
`:5433` — so both paths can coexist; see `e2e/docs/local-setup.md`.

## Troubleshooting

- **Migrations fail creating bm25 / pg_search indexes** — brew `postgresql@17`
  does not ship `pg_search`, so those migrations error out. Apply the
  non-pg_search migrations, then insert marker rows into
  `drizzle.__drizzle_migrations` (`hash` = sha256 of the `.sql` file contents,
  `created_at` = the journal entry's `when`). The full procedure — including
  the marker-ordering trap that permanently skips sandwiched migrations — is in
  [`.agents/skills/acceptance-dockerless-env/SKILL.md`](../../.agents/skills/acceptance-dockerless-env/SKILL.md);
  follow it rather than this summary.
- **Local startup rejects Clerk configuration** — use the development publishable
  key and development secret key from the same existing Clerk instance. If set,
  `CLERK_ISSUER` must match the publishable key metadata. Production keys are not supported by `bun run dev`.
- **Auth redirects to the wrong port / login loops** — use the URLs printed by
  `bun run dev`; for standalone server commands match `APP_URL` to the listener.
- **`EADDRINUSE`** — `lsof -ti:<port> | xargs kill -9`, or delete
  `.records/env/agent-testing-ports.env` to let the bootstrap re-allocate.
- **`init-dev-env.sh` exits immediately** — a repo-root `.env` exists and wins
  by design.
- **Docker path only**: `Cannot connect to the Docker daemon` → start Docker
  Desktop, or switch to the brew path.
- **MyWork routes crash on fresh load (macOS/Windows)** — a route that renders
  the "Oops" error page only on fresh loads but works after client-side
  navigation is usually a case-insensitive filesystem import collision: two
  modules whose paths differ only in case + extension (e.g. `foo.ts` vs
  `Foo.tsx`) make an extensionless specifier resolve to the wrong file, and
  vite's preload then throws a `SyntaxError`. Give colliding helpers a
  distinct basename (see `workQueryVirtualListModel.ts`, renamed from
  `workQueryVirtualList.ts` for exactly this). Audit for other collisions
  with `find src -type f \( -name '*.ts' -o -name '*.tsx' \) | sed 's/\.[^.]*$//' | tr 'A-Z' 'a-z' | sort | uniq -d`.
- **Desktop shell crashes after login** — `SyntaxError: lucide-react.js does
not provide an export named 'GlobeOff'` (or another recent icon): the
  desktop vite optimizer bundled the stale transitive `lucide-react` copy
  hoisted by `publicHoistPattern`. `apps/desktop` now declares
  `lucide-react` as a direct dependency so its lockfile resolves a current
  version; if you see this on an older checkout, `pnpm install` inside
  `apps/desktop` after pulling, then `rm -rf node_modules/.vite/deps` to
  drop the stale optimized chunk.
- **CI fails at "Install deps" with `ERR_PNPM_OUTDATED_LOCKFILE`** —
  `apps/desktop` is a standalone pnpm workspace that commits its own
  `apps/desktop/pnpm-lock.yaml`, and every test.yml job installs with
  `--frozen-lockfile`. Adding a workspace package or a `workspace:*`
  dependency under `packages/` changes the importer set and makes the
  committed lockfile stale; CI then dies \~1 minute in and each leaf job's
  fail-fast step cancels the run. Whenever you add or move a workspace
  package or change a workspace dependency, regenerate the lockfile with
  `pnpm install` inside `apps/desktop` and commit the result.
- **`checkHostDeviceBoundaries` fails on untouched files** — new host-probe
  modules (e.g. `heterogeneous-agents/src/scan/*`, `prime-harness/readiness.ts`)
  enter the web entry closure before their edges are exempted. The gate wants
  a precise `{rule, importer, target}` entry in
  `scripts/ci/hostDeviceBoundariesAllowlist.json` mirroring the `spawn/*`
  rows, not `--no-verify`.
