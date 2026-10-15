# Architecture refactor verification

The refactor addresses seven architectural concerns while retaining the modular
monolith. See [the boundary rules](architecture-boundaries.md) for ongoing
development requirements.

| Concern                                 | Implemented change                                                                 | Verification                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Non-reproducible installs               | Root, CLI, Desktop and supplemental Docker dependency locks; frozen CI installs    | Actual isolated frozen installs; CLI/Desktop locks remained byte-identical              |
| Database imports application crypto     | Shared cipher contract and implementation; application injects configuration       | Database dependency guard and cipher/model/router compatibility tests                   |
| Task transport owns domain transactions | Update and batch-parent application services; domain errors mapped at RPC boundary | Permissions, CAS, graph locks, transactional rollback and outbox tests                  |
| Runtime imports frontend stores         | Explicit host capabilities and frontend adapter                                    | Runtime dependency guard, core and adapter tests                                        |
| Server depends on root installation     | Direct dependencies, external-import guard, standalone deployment smoke            | Production build; isolated deployed artifact starts and returns `/health`               |
| Features/stores access raw RPC clients  | Domain services, shared query hooks and cache keys                                 | Frontend boundary guard, request isolation and existing consumer tests                  |
| One application-wide compiler boundary  | Shared compiler base, independent package configurations, affected-package runner  | See [typecheck coverage](typecheck-boundaries.md); full application CI remains required |

## Executed checks

- `node scripts/type-check-affected.mjs --all` passed: database production
  source, runtime core/tests, cipher declarations and the database cipher adapter.
- Task coverage: 238 model tests, 114 application-service tests, 55 background
  consumer tests, four RPC error-mapping tests and 185 integration cases. The
  integration run passed 184 cases; the remaining case exceeded its PGlite
  initialization hook timeout and passed in an isolated rerun.
- Runtime core, adapters and executor tests: 61 cases.
- Frontend migration: 103 tests across 21 files, plus focused shared-hook and
  existing consumer regression runs. Root consumer regression run: 188 tests
  across nine files; subsequent teammates service regression run: 14 tests.
  These runs overlap and must not be summed into a unique total.
- All three architectural dependency guards and whitespace checks passed.
- Standalone server production build, external dependency validation, isolated
  production deployment and actual process startup passed. The health check
  verifies packaging/startup; it does not exercise a live database.
- Supplemental Docker dependencies were frozen-installed outside the repository.
  All seven direct modules loaded and Sharp performed a real image transform.
  Repeating the test with the exact Dockerfile COPY subset also passed on Linux
  x64 with Node 24.19.0.

## Accepted typecheck scope

There is no separate frontend compiler project. Feature and store code stay on
the root `pnpm type-check` gate (`tsgo --noEmit` in the Typecheck job). The
affected runner's independent units are `@orvilo/secret-cipher` (`full`),
`@orvilo/agent-manager-runtime` (`full`), and `@orvilo/database` (`production`
source plus a `partial` cipher adapter). Database has no `full` boundary, so
the runner still lists it as a full-CI requirement. Unmigrated packages,
including the application, stay on that list too.

The root and `apps/server` importers both resolve
`@hatchet-dev/typescript-sdk` to 1.38.0. The Docker supplemental project stays
on 1.33.1, and the image copies that tree over `node_modules/@hatchet-dev`.
That overlay matches the previous image pin; it is not the copy the full
typecheck compiles against.

## Follow-up CI

On `c99f7a34a` the push [Test CI](https://github.com/alexj11324/orvilo1/actions/runs/38774449701)
passed, including the full typecheck, both server shards and the standalone
`/health` deploy, both app shards, package tests, desktop typecheck and tests,
and the Required Quality Gate. [E2E](https://github.com/alexj11324/orvilo1/actions/runs/38774449688)
and [UI alignment](https://github.com/alexj11324/orvilo1/actions/runs/38774450195)
passed on the same commit. The pull-request merge ref `212a0c246` has the same
tree as `c99f7a34a`.

Earlier, on `8865dc077`, app shard 1 failed
`scripts/dockerWorkspaceManifests.test.ts` because it still looked for
`pnpm i &&`. That assertion now expects `pnpm i --frozen-lockfile`.

## Build acceptance

These builds used the merge ref above. Frozen installs did not rewrite the
lockfile.

- [Release CLI](https://github.com/alexj11324/orvilo1/actions/runs/38774454685)
  installed the isolated CLI workspace with `pnpm install --frozen-lockfile`
  and no `--ignore-scripts`, then packed the CLI and installed that package
  outside the workspace.
- [Docker PR Build](https://github.com/alexj11324/orvilo1/actions/runs/38774454809)
  built and published linux/amd64 and linux/arm64 as
  `ghcr.io/alexj11324/orvilo1:pr-codex-architecture-boundaries-212a0c24`.
  The supplemental project remains pinned to Hatchet 1.33.1 and is copied over
  the app install. Typecheck still compiles the workspace copy at 1.38.0.
- [Desktop PR Build](https://github.com/alexj11324/orvilo1/actions/runs/38774454830)
  installed with scripts enabled and packaged linux, macOS arm64, macOS Intel,
  and Windows. The ASAR gate, macOS merge, and PR publish jobs passed.

The one-off branch trigger used to start those PR builds has been removed.
Later pushes do not rebuild the image or desktop packages.

## Coverage limits

No production deployment or browser acceptance was performed. Package-level
checks must not be represented as full application verification. `Skeleton
requirement` fails until the PR body contains `skeleton: no-change`. The UI
edits route data through domain services and do not change loading skeletons.
That check is not a required status check for `canary`.
