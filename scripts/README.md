# Dev Scripts Index

One-page index of the repository's dev/build/ops scripts: what each does, which
env vars it needs, and where it is invoked from. Scripts that write to a
database must follow the guard-rail policy below.

## Database & seed scripts

| Script                                        | Purpose                                                                   | Required env                                                                                     | Invoked from                                        |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `migrateServerDB/`                            | Apply pending Drizzle migrations                                          | `DATABASE_URL` (`DATABASE_DRIVER`, `NODE_ENV`)                                                   | `bun run db:migrate` (CI/bootstrap)                 |
| `installFtsSearchSyncCapture/`                | Install FTS sync capture triggers/outbox into the DB                      | `DATABASE_URL`                                                                                   | `bun run db:install-fts-search-capture` (bootstrap) |
| `seedUserInfo/`                               | Set `users.full_name`/`username` for one user by email                    | `DATABASE_URL`                                                                                   | `bun run workflow:seed-user-info` / manual          |
| `resetOnboarding/`                            | Clear one user's onboarding state so they re-enter the flow               | `DATABASE_URL`                                                                                   | `bun run workflow:reset-onboarding` / manual        |
| `backfillWorkspaceKnowledgeBaseVisibility.ts` | Propagate `public` visibility from workspace KBs to their files/documents | `DATABASE_URL`                                                                                   | manual (`tsx`, dry-run by default)                  |
| `pgSearchCleanup/`                            | Drop leftover pg\_search/ParadeDB objects after the Elasticsearch cutover | `DATABASE_URL`, `FTS_SEARCH_PROVIDER=elasticsearch` (apply)                                      | manual (`tsx --status` / `--apply --yes`)           |
| `clerk-to-betterauth/`                        | One-shot Clerk → Better-Auth user migration                               | `CLERK_TO_BETTERAUTH_MODE` (default `test`), `TEST_/PROD_CLERK_TO_BETTERAUTH_DATABASE_URL`       | manual                                              |
| `nextauth-to-betterauth/`                     | One-shot NextAuth → Better-Auth user migration                            | `NEXTAUTH_TO_BETTERAUTH_MODE` (default `test`), `TEST_/PROD_NEXTAUTH_TO_BETTERAUTH_DATABASE_URL` | manual                                              |

## Search (FTS / Elasticsearch)

| Script                                    | Purpose                                              | Required env                     | Invoked from                                      |
| ----------------------------------------- | ---------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| `elasticsearchReindex/`                   | Rebuild FTS indexes in Elasticsearch                 | `DATABASE_URL`, ES env (see dir) | `bun run fts-search:reindex` (`--apply` to write) |
| `elasticsearchSync/`                      | Drain the FTS sync outbox into Elasticsearch         | `DATABASE_URL`, ES env           | `bun run fts-search:sync`                         |
| `elasticsearchCleanupIneligibleMessages/` | Remove ineligible messages from the ES message index | `DATABASE_URL`, ES env           | `bun run fts-search:cleanup-ineligible-messages`  |

## Build, release & CI helpers

| Script                                         | Purpose                                                                                        | Required env            | Invoked from                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `devStartupSequence.mts`                       | Orchestrate `bun run dev` (Next + Vite SPA)                                                    | —                       | `bun run dev`                                                                           |
| `copySpaBuild.mts` / `copySpaBuildCore.ts`     | Copy built SPA bundles into `public/`                                                          | —                       | `bun run build:spa:copy`                                                                |
| `generateSpaTemplates.mts` / `spaHtmlPaths.ts` | Generate HTML templates from built SPA/mobile/desktop bundles                                  | —                       | `bun run build:spa:copy`                                                                |
| `dockerPrebuild.mts`                           | Docker build-time env check + info print                                                       | build env               | Dockerfile (`build:docker`)                                                             |
| `serverLauncher/startServer.js`                | Production container entrypoint (shared with `_shared/checkDeprecatedAuth.js`)                 | runtime env             | Dockerfile `CMD`                                                                        |
| `registerDesktopEnv.cjs`                       | Preload `.env.desktop`/`.env.desktop.local` before Next boots (`node -r`)                      | —                       | desktop build (`node -r`)                                                               |
| `runNextDesktop.mts`                           | Next launcher that layers `.env.desktop*` when `DESKTOP_BUILD=true`                            | `DESKTOP_BUILD`         | manual (no package script)                                                              |
| `desktopCanaryTrigger.cjs`                     | Decide whether a commit message warrants a desktop canary build                                | —                       | `.github/workflows/release-desktop-canary.yml`                                          |
| `vercelIgnoredBuildStep.js`                    | Vercel "ignored build step" gate (skips lighthouse/gru/automatic/reproduction branches)        | `VERCEL_GIT_COMMIT_REF` | Vercel project settings                                                                 |
| `ci/`                                          | Preview/typecheck gates (`vercelPreviewGate.mjs`, `typecheckDiff.mjs`, Vercel preview payload) | CI env                  | GitHub Actions / Vercel                                                                 |
| `electronWorkflow/`                            | Desktop channel build, packaging, version stamp                                                | build env               | `desktop:build-channel`, `desktop:package:app:platform`, `workflow:set-desktop-version` |
| `releaseWorkflow/`                             | Cut `release/vX.Y.Z` branch + PR                                                               | —                       | `bun run release:branch`                                                                |
| `hotfixWorkflow/`                              | Cut a `hotfix/*` branch off `main`                                                             | —                       | `bun run hotfix:branch`                                                                 |
| `changelogWorkflow/`                           | Generate changelog entries                                                                     | —                       | `workflow:changelog[:gen]`                                                              |

## Lint, checks & codemods

| Script                                                                              | Purpose                                                                  | Required env                | Invoked from                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------- | ---------------------------------------- |
| `checkConsoleLog.mts`                                                               | Lint: forbid `console.log` outside the whitelist                         | —                           | `bun run lint:console`                   |
| `type-check.mjs`                                                                    | CI-only full-repo `tsgo --noEmit` gate (fails fast locally)              | `CI`                        | `bun run check --type` / `Typecheck` job |
| `countEnWord.ts`                                                                    | Count locale word usage under `locales/en-US`                            | —                           | `bun run workflow:countCharters`         |
| `migrate-spa-navigation.ts`                                                         | Codemod: Next navigation hooks → React Router hooks                      | —                           | manual                                   |
| `replaceComponentImports.ts`                                                        | Codemod: rewrite component import specifiers (dry-run capable)           | —                           | manual                                   |
| `lint-staged-skip-packet.mjs`                                                       | lint-staged helper packet                                                | —                           | lint-staged config                       |
| `i18nWorkflow/`                                                                     | Locale key workflows (unused-key analysis/cleanup)                       | `OPENAI_API_KEY` for `i18n` | `bun run i18n`, `i18n:unused*`           |
| `docsWorkflow/`, `mdxWorkflow/`, `readmeWorkflow/`, `dbmlWorkflow/`, `cdnWorkflow/` | Docs/README/DBML/CDN generation pipelines                                | —                           | `workflow:*` package scripts             |
| `mobileSpaWorkflow/`                                                                | Build mobile SPA + upload assets to S3                                   | `MOBILE_S3_*`               | `bun run workflow:mobile-spa`            |
| `slimming/`                                                                         | Repo slimming census + boundary manifest (`boundary.json`, `census.mjs`) | —                           | manual                                   |

## Misc utilities

| Script                       | Purpose                                                                     | Required env      | Invoked from             |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------- | ------------------------ |
| `setup-test-postgres-db.sh`  | Boot a local `paradedb/paradedb` Docker container for tests                 | Docker            | manual                   |
| `create-test-tasks.js`       | Paste-in-browser helper that creates demo agent tasks via `/trpc`           | logged-in session | manual (browser console) |
| `workerDeployAnnotations.ts` | Stamp Cloudflare worker versions with the deploying operator                | deploy env        | worker deploy scripts    |
| `_shared/`                   | Shared helpers (`checkDeprecatedAuth.js`) used by build/runtime entrypoints | —                 | imported                 |
| `generate-oidc-jwk.mjs`      | Generate an OIDC JWK keypair                                                | —                 | manual                   |

## Other script homes

- `.agents/acceptance/scripts/` — agent-testing harness (`init-dev-env.sh`,
  `test-env.sh`, `setup-auth.sh`, `electron-dev.sh`, `report-init.sh`, probes,
  recorders, mocks). `init-dev-env.sh` is the style reference for headers.
- `e2e/scripts/` — e2e bootstrap (`setup.ts`) and mock services
  (`mockServices.ts`: fake Agent Gateway :3407 + mock LLM :3406).

## Env files

- `.env.example` — production/self-hosting reference; all vars optional unless a
  section's `Required:` line says otherwise.
- `.env.example.development` — pre-filled local dev stack (docker-compose).
- `.env.desktop` — copy to `.env` for desktop dev (`DESKTOP_BUILD=true`).
- `.records/env/*.env` — **generated runtime state** written by dev/e2e/agent-
  testing scripts (ports, resolved URLs). Never hand-edit, never commit.

## Guard rails

`ORVILO_PARITY_SEED_TARGET=local`-style explicit-target confirmation is the
established pattern for seeds that write fixture data: a seed must fail fast
unless it can prove it is pointed at a disposable local target. On canary that
env var is consumed by the Linear-parity seed suite (not yet merged), so the
equivalent here is:

- **Explicit-target or confirmation gate required** for anything destructive:
  - `pgSearchCleanup` — read-only `--status` default; `--apply` needs `--yes`
    and asserts `FTS_SEARCH_PROVIDER=elasticsearch`.
  - `backfillWorkspaceKnowledgeBaseVisibility` — dry-run unless `--apply`.
  - `elasticsearchCleanupIneligibleMessages` — `--apply` needs `--yes`,
    `--all-workers-upgraded`, and a `--state-file`.
  - `seedUserInfo`, `resetOnboarding` — scope writes to the single user row
    named by the required `<email>` argument; idempotent/targeted.
  - `clerk-to-betterauth`, `nextauth-to-betterauth` — mode-scoped DB URLs
    (`TEST_*` vs `PROD_*`), default `test` mode.
- **Intentionally unguarded (CI/bootstrap)** — must stay idempotent-safe:
  - `migrateServerDB` (Drizzle journal skips applied migrations),
    `installFtsSearchSyncCapture` (lock-retried DDL install),
    `elasticsearchSync` (outbox drain), `elasticsearchReindex`
    (`--status`-style command resolution; writes need `--apply`).

New scripts that write fixture data to a DB should adopt the same convention:
default to a read-only/`status` mode or require an explicit target/confirmation
flag, and refuse to run without `DATABASE_URL`.
