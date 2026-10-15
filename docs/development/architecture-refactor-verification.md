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

## Coverage limits

The full Docker image was not built. CLI/Desktop frozen-install checks used
`--ignore-scripts`; they do not validate Electron native installation or desktop
execution. Full application typechecking and the complete test suite remain CI
gates under repository policy. No production deployment or browser acceptance
was performed. Package-level checks must not be represented as full application
verification.
