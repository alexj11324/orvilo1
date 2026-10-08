# Local setup

The one supported way to run Orvilo on your machine. A repo-root `.env` always
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

| Command                            | Starts                                                                                                                                 | Port                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `bun run dev`                      | Next.js + Vite SPA + Clerk accounts portal concurrently (full stack)                                                                   | app 3010, SPA 9876, auth 3018 |
| `bun run dev:spa`                  | Vite SPA only; proxies API calls to `localhost:3010` and prints a Debug Proxy URL for developing against the production backend        | 9876                          |
| `bun run dev:desktop:skip-login`   | Next.js + Electron with an isolated temporary desktop profile; signs in the existing local seed user and verifies renderer/server auth | app 3010, CDP 9263            |
| `pnpm --filter @orvilo/server dev` | Standalone Hono backend service                                                                                                        | —                             |
| `bunx next start`                  | Production build serve (after `bun run build`)                                                                                         | 3010 (`-p` to override)       |

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

The seed user and Better Auth helper commands below are legacy test workflows;
they do not validate the normal Clerk/Google sign-in path.

For Electron development, run `bun run dev:desktop:skip-login` after the local
database already has the seed user. The command starts Next.js and Electron,
signs in through Better Auth, and prints the user ID only after both the
renderer and backend accept the session. It does not create a user or seed a
database. `SEED_EMAIL` and `SEED_PASSWORD` can select another existing local
test account. `Ctrl-C` stops both processes and removes the temporary desktop
profile. For an Electron instance already running with CDP on port 9263, use
`bun run dev:desktop:login-local`; set `ORVILO_DESKTOP_CDP_PORT` if it uses a
different port. Both commands require an HTTP server on literal `localhost`.

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
