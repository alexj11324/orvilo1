# CAID Dispatch Admission (rollout gate)

`caid_dispatch` is the server-side rollout gate for **new** CAID orchestrated
dispatches — goal frontier fan-out (`trigger: 'goal'`) and planner/orchestrator
wakes (`trigger: 'orchestrator'`). It exists so a deployment can cut over to
orchestration deliberately instead of landing it implicitly with the code.

This is a dispatch admission control, not a legacy-engine switch: it does not
and cannot re-enable retired execution paths.

## Semantics

- **Default: off everywhere** (deployments, users, workspaces — `caid_dispatch`
  defaults to `false` in `packages/app-config/src/featureFlags/schema.ts`).
- Enable per **deployment** (`caid_dispatch: true`), per **user**
  (`caid_dispatch: ["user-id", ...]`), or per **workspace**
  (`caid_dispatch_workspaces: ["workspace-id", ...]`).
- Sources, evaluated in `apps/server/src/featureFlags/caidAdmission.ts`:
  runtime config (published `feature-flags` snapshot), env `FEATURE_FLAGS`,
  and the per-user boolean override store (`caid_dispatch: true`).

## Gated entries

| Entrypoint                                   | Behavior when off                                              |
| -------------------------------------------- | -------------------------------------------------------------- |
| Goal fan-out (`GoalService.dispatchWork`)    | Node stays untouched — `waiting_external`, no claim, no error. |
| Planning run-intents (`linearSync/planning`) | `requested` dispatch rows stay durable for the watchdog sweep. |
| `taskDispatchStart` sweep                    | Returns `waiting` / `caid_dispatch_disabled`, row untouched.   |

## Explicitly unaffected (settlement must keep working)

- `manual` runs — including integration corrective and delivery-settlement runs.
- `schedule` and `heartbeat` task wakes (per-task automation, not orchestration).
- `taskRecoveryCoordinator` resumes of already-running orchestration.
- Cancellations, status reads, and all in-flight run state transitions.

## Status check

- Client: `serverFeatureFlags.enableCaidDispatch` (user-level half; workspace
  grants are evaluated server-side only).
- Ops: publish the flag through the runtime-config `feature-flags` snapshot or
  set `FEATURE_FLAGS="+caid_dispatch"` (deployment-wide).

## Rollback

The gate is env/runtime-config only — no schema or persisted-shape change, so a
code rollback needs no data migration: older code simply ignores the flag and
dispatches unconditionally. Rows created while the gate was on are ordinary
dispatch/goal rows readable by any earlier version.
