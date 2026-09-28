# Slimming 05 — Standalone Acceptance product surface (ORV-103)

## Audit verdict

The standalone Acceptance platform was already retired by the earlier
hidden-surface-retirement campaign, and its completion gate is itself the
canonical Task Review flow. What remained for ORV-103 was residual sweep, not a
fresh migration:

- Routes: `/acceptance/*` and `/verify/*` are reserved-word redirects onto the
  task board (`desktopRouter.shared.tsx` / `mobileRouter.config.tsx`) — kept so
  stored links land somewhere sane and `acceptance`/`verify` can never be read
  as a `:workspaceSlug`.
- CLI: the `acceptance:*` command group and `verifyAcceptance` are gone
  (`productSurfaceRetirement.test.ts` guards).
- Workbench: `route('acceptance')` / `route('verify')` are gone (same guard).
- Public distribution: `public/acceptance` and the pullable Acceptance skill +
  `.agents/skills/acceptance` symlink are gone (same guard).
- Server procedures: `acceptanceRouter` no longer exposes parentless creation
  (`ensure`, `attachRun`), flow authoring (`publishFlow`/`deleteFlow`/`startFlow`/
  `recordFlowStep`/`completeFlow`), or standalone collection reads/writes
  (`acceptance.retired.test.ts` guards the procedure list).

## Canonical mapping (what the needed semantics live as now)

| Old standalone concept        | Canonical home                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acceptance aggregate + rounds | Task-scoped `verify/*` services (`acceptanceService`, `executor`, `settle`, `statusService`, `lifecycle`) driving the task completion gate                                |
| Review UI                     | Task detail panel + portal views (`features/Acceptance` rendered through `Portal/Acceptance`, `AgentTaskDetail/TaskAcceptance*`, `GlobalOverlays/AcceptancePortalDrawer`) |
| Evidence submission           | `builtin-tool-acceptance-evidence` + `toolExecution/serverRuntimes/acceptanceEvidence` — the run-scoped tool the executing agent uses to satisfy `requiredEvidence`       |
| Review comments               | `acceptanceComment` router + `Viewer/Comments` — task-scoped discussion threads                                                                                           |

## Residuals deleted this pass

- `Viewer/Flow/FlowVersionDiff.tsx` + `flowDiff.ts` (+ test): version-compare
  modal for the standalone flow authoring tree — orphaned since flow authoring
  procedures were retired.
- `Viewer/Review/repairRerun.ts` (+ test): standalone send-back helper for the
  retired dispatch/markRepairing procedure pair.
- `Viewer/History/AcceptanceViewReportLink.tsx`: standalone "view full report"
  entry — orphaned.
- Locale keys: `flow.diff.*` (23 keys) and `acceptance.viewFullReport` in
  `verify` namespace, en-US + zh-CN mirrors.

## Validation

- Repo-wide `tsgo` typecheck: clean.
- `bun run check`: lint clean, related tests green.
- `productSurfaceRetirement.test.ts` / `acceptance.retired.test.ts` /
  `retirementGuards.test.ts` still pass — the kept halves stay guarded.
