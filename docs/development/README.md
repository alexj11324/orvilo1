# Development environments

Where Orvilo code runs, in lifecycle order. The full environments spec lives in
[docs/environments.md](../environments.md); this file is the map, and
[local-setup.md](local-setup.md) is the local path in detail.

| Environment | Purpose                                      | Where it runs     | How to start                                                                                                                                                                                                                                                                                                                                            | What data it has                                                                                                                                                                                       | Who seeds it                                                                                                                        |
| ----------- | -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Local dev   | Day-to-day development and acceptance checks | Your machine      | [local-setup.md](local-setup.md) — bootstrap via `.agents/acceptance/scripts/init-dev-env.sh` (`env` / `write` / `setup-db` / `migrate` / `seed-user` / `s3` / `preflight` / `dev` / `dev-next` / `stop-dev` / `clean*`), then `bun run dev`                                                                                                            | Generated env under `.records/env/` (`e2e-dev.env`): `APP_URL`/`PORT` 3010, Vite/SPA 9876, Postgres `localhost:5432` db `orvilo`, Redis `:6379`, mock LLM `:3406`, mock gateway `:3407`, local S3 mock | `init-dev-env.sh seed-user` (baseline test user + CLI API key); `bun run workflow:seed-linear-parity` for the Linear-parity fixture |
| CI / test   | Required quality gate + e2e suite            | GitHub Actions    | Automatic on push / PR — `.github/workflows/test.yml`, `.github/workflows/e2e.yml`                                                                                                                                                                                                                                                                      | Fresh ephemeral Postgres service; deterministic per-test fixtures                                                                                                                                      | Each run seeds itself — nothing shared                                                                                              |
| Preview     | Per-PR reviewable deployment                 | Vercel            | `.github/workflows/vercel-preview.yml`, once the gates pass; a quota circuit breaker skips deploys when the preview budget is exhausted                                                                                                                                                                                                                 | None — build artifact only                                                                                                                                                                             | Nobody                                                                                                                              |
| Production  | Live `orvilo.aspectlylabs.com`               | Prod host, Docker | `.github/workflows/deploy-orvilo1.yml`: a canary push builds a `ghcr.io` `sha-<commit>` image, the promote job repoints the floating `:canary` / `:main` tags once the commit's Required Quality Gate is green, and a manual dispatch deploys by pinned digest. `main` is the release line, not an environment — see [branch-model.md](branch-model.md) | Real production data                                                                                                                                                                                   | Nobody — no seeding                                                                                                                 |
| Staging     | —                                            | Does not exist    | `canary` doubles as the dogfood line                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                      | —                                                                                                                                   |

## Seeds

- `init-dev-env.sh seed-user` — baseline test user
  `agent-testing@orvilo.aspectlylabs.com` / `TestPassword123!` plus a CLI API
  key. Run once before sign-in or CLI use.
- `bun run workflow:seed-linear-parity` — the Linear-parity fixture (teams,
  projects, tasks, approvals, views) used by the parity checks. Two guards keep
  it local: it refuses to run without `ORVILO_PARITY_SEED_TARGET=local`, and its
  DB assertion pins `DATABASE_URL` to `localhost:5432/orvilo_linear_parity_20260922`.
  That is a **dedicated database, not the dev `orvilo` DB** — the heavy
  synthetic fixture stays out of everyday dev data and can never be pointed at
  a deployed environment. Fixture contents: `scripts/seedLinearParity/README.md`.

## Reading CI failures

Every leaf job in `test.yml` starts with a "Fail fast — cancel sibling jobs"
step: the first leaf to fail cancels the whole run, so downstream jobs and
sibling matrix shards report `cancelled` rather than `failure`. A `cancelled`
shard is not the failure — open the logs of the shard job that actually went
red. `Required Quality Gate` is the branch-protection check; on
duplicate-skipped PR runs it mirrors the owning push run's verdict.
