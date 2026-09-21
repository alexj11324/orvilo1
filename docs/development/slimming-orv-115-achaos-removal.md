# ORV-115 — Remove orphan AChaos subsystem

Gate D (Residual Disposition & Census Completeness). Deletes the unintegrated chaos-engineering toolkit.

## Evidence for deletion

| Signal                                                      | Result                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| External inbound imports to `packages/achaos/**`            | 0                                                           |
| `@achaos/*` package.json dependencies outside the subsystem | none                                                        |
| `runChaosExperiment` / `createRuntimeChaosHooks` references | only AChaos internals + `.agents/chaos/goal-integration.md` |
| Live Goal / Agent Eval / CI consumers                       | none found — README lists them as future work               |
| `.agents/chaos/**`                                          | fixtures + docs for the unused subsystem only               |

## Removed

- `packages/achaos/{core,database,process,runtime,runner,testing,tracing}` — 7 private workspace packages, 32 census-tracked source files
- `.agents/chaos/**` — fixtures + goal-integration doc
- `packages/achaos/vitest.config.mts`, README

## Boundary ledger

`misc-adjacent-packages` (INVESTIGATE) replaced by `achaos-chaos-toolkit` (DELETE, glob `packages/achaos/**`, fileCount 0) — resurrection now fails `census.mjs --check`.

## Metrics delta

| Metric                   | Before | After                                 |
| ------------------------ | ------ | ------------------------------------- |
| sourceFiles              | 11,951 | 11,919                                |
| workspacePackages        | 108    | 101                                   |
| INVESTIGATE capabilities | 2      | 1 (`knowledge-rag`, owned by ORV-114) |

## Verification

- `node scripts/slimming/census.mjs --check` → exit 0
- `bunx tsgo --noEmit` → clean
- zero live `@achaos/` references outside `docs/development/slimming/` metrics artifacts
- `pnpm-workspace.yaml` uses `packages/**` glob — the seven AChaos packages were real workspace members; no manifest edit needed, workspace count drops automatically (108 → 101)

Rollback: plain git revert — no DB or external contract involved.
