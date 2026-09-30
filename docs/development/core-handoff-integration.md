# Core runtime ownership, handoff and completion

The Linux cloud candidate extends canonical Orvilo execution authority. It does not create a second task runner or treat runtime `end_turn` as task completion. Initial transferred source baseline was `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`; restored original handoff and verification blobs were checked as `c495d3cefa2f5e80d109cde1c90c6e370ad8fd6c` and `caf930b6e5dce0b82dea93b5ee74d4d18ea54e31` before changes.

## Canonical authority and schema

`TaskExecutionControlModel` keeps live process registration on existing `task_topics`, adding `execution_control` and `execution_control_revision`. The existing `executionEpoch` and `executionGrantId` remain the sole delegated epoch/grant. One new `task_execution_handoffs` table stores immutable transfer intent and phase history, with one active handoff per task. The existing `task_topics.handoff` LLM summary is unchanged. SQL receipt persistence is a separate previously added candidate described in `core-sql-receipts.md`.

Runtime ownership is not inferred from dispatch provisioning or reconciliation leases. Registration records an opaque runtime lease, owner, registration ID, expiry, supervisor/tree/session and admission state. Renewal admits only the exact live running owner and is bounded by the delegation grant. Held, expired and superseded owners cannot renew.

The schema exports unnumbered candidate DDL, explicitly installed only in disposable acceptance databases. No numbered migration or journal entry has been allocated. Deployment requires a coordinated production migration before code selecting the new columns is enabled; the acceptance installer is not a production migration path.

## Admission and durable transfer

`CanonicalRunAuthority` locks and revalidates actual task, dispatch, delegated grant, topic and workspace membership rows. It keeps dispatch fence/generation distinct from delegated epoch and runtime lease. Startup admission permits the registered startup state; action admission requires the live activated runtime. Server-owned identity is mandatory, and missing or malformed registration fails closed.

Handoff atomically holds mutation admission while retaining the source owner. The concrete host drains accepted actions and stops its registered supervisor-owned process tree. Database proof checks bind the source tree/supervisor, zero remaining processes/actions and observation time; these structural checks alone are not OS termination evidence. The host must recheck actual supervisor quiescence before transfer.

Transfer writes successor owner, a fresh lease, canonical epoch + 1 and the durable transferred phase in one transaction. Successor registration consumes the same intent. Retries return the existing intent; repeated successor activation must match the identical tree, supervisor and session. Recovery reads persisted phases rather than inferring progress from runtime output. Lock contention and stale revisions fail before effects and require retry.

Ordinary stop atomically retains and marks the exact owner stopped and fences the existing dispatch. Grant revocation does not prevent cleanup, but an obsolete source cannot cancel a successor sharing that dispatch. Handoff source drain preserves the dispatch. Failed successor startup remains stopped and held rather than silently launching another writer.

Legacy `claimExecutionEpoch` and `TaskTopicModel.startRun` reject registered Core topics. `assertMayCommit` requires the exact server-owned runtime identity for registered runs and denies held, stopped or expired admission. Unregistered ACP execution retains its existing delegation path.

## Verified completion

`CanonicalVerifyCompletion` requires the actual passed and confirmed frozen Verify plan, persisted passed criteria, and explicit server-owned mappings to verified durable receipts for every required criterion. It neither creates a passed verdict nor trusts runtime output as a verdict. Receipt fences use the runtime owner and opaque runtime lease.

The final authorization hook runs inside `TaskModel.updateStatusForExecutionContract` through existing `driveTaskFromVerify` and `TaskService.updateStatus`. It locks/rechecks dispatch, task, grant, topic epoch/runtime identity, membership, Verify run and result rows, including revalidation after asynchronous receipt loading. It does not hold an outer transaction over Verify convergence. Existing non-Core callers retain their prior behavior.

The adapter reads actual status after convergence. Recurring tasks that rearm are explicitly not reported completed. This guard fences the final status mutation; earlier Verify publishing/integration actions retain their existing authorization gates.

## Linux acceptance evidence

The current isolated actual PostgreSQL evidence comprises:

- Model acceptance: 14 passed, including concurrent intents, durable phase recovery, invalid proofs, revocation/expiry/membership checks, lease renewal, old-source stop denial, successor identity replay, revoked-owner cleanup, transaction rollback, database backend termination recovery and application-process crash recovery across all five durable phases.
- Canonical admission: 18 passed, including action-drain/cancellation serialization and actual legacy epoch, commit and start-run rejection while held.
- Registration-aware canonical completion: 10 passed, including real Verify positive completion, receipt-loading takeover denial and capped recurring authorization paths.
- Concrete host acceptance: 2 passed; detailed host/supervisor evidence is maintained by the host acceptance suite.

Phase recovery now runs five fresh Node processes against persistent PostgreSQL. Each commits its durable handoff stage, is terminated with SIGKILL, and is followed by a new process that recovers the next stage. Separate database backend termination during a transaction and trigger failure verify rollback and subsequent recovery. The source runtime identities and quiescence proofs in these model tests are fixtures; killing the test application does not prove termination of a supervised runtime tree. Physical runtime isolation and tree termination are exercised separately by the concrete host/supervisor acceptance tests. The final independent database rerun passed all 14 cases in 17.96 seconds.

Scoped lint and whitespace checks passed. Final broad typecheck is pending; no full-repository typecheck pass is claimed. No production data, credentials, subscription, deployment or persistent permission changes were performed by this acceptance work.

## Real PostgreSQL recovery acceptance (2026-09-30)

`packages/database/src/models/__tests__/taskExecutionControl.test.ts` passed **14/14**
on disposable PostgreSQL `127.0.0.1:32770/core_handoff` at 17:29:30 UTC (exit 0,
19.73 seconds). The full baseline migrations ran through `getTestDB`, then the
candidate handoff DDL was installed explicitly. No production migration was applied.

Coverage includes concurrent begin with one winner, persisted phase reconstruction,
atomic owner/lease/epoch transfer, source fencing, successor resume idempotency,
wrong/old/future/undrained proofs, revoked grant, changed membership, expired lease,
owner-only renewal, stale source stop rejection, exact successor stop, cleanup stop
after grant revocation, and rejection of legacy `startRun` overwrites.

Two real transactional failure boundaries were exercised:

- A uniquely named, handoff-ID-scoped PostgreSQL trigger raises an exception on the
  history transition after the canonical topic update. Owner, lease, epoch, revision
  and phase all remain unchanged; removing the trigger allows the same transfer retry.
- A dedicated PostgreSQL connection blocks in a uniquely scoped history trigger.
  The test observes that connection's `PgSleep` state and terminates only that
  backend via `pg_terminate_backend`. A fresh connection observes the rollback and
  retries successfully. Expected client termination events are collected and checked;
  the passing run has no unhandled errors.

Additionally, `fixtures/handoffCrashChild.ts` runs **five separate Node processes**.
Each commits one durable phase (prepared, quiescing, quiescent, transferred, resumed),
reports the committed snapshot over IPC, and is then terminated with SIGKILL by its
parent. The next new process resumes against the same PostgreSQL database. The test
checks epoch remains 1 until transfer, becomes exactly 2 thereafter, and duplicate
resume cannot increment it or create another registration. Only test-owned child
processes are signalled. This proves actual control-client process restart across
committed phases; it does not claim those fixtures launched or killed a Prime tree.
The fixture quiescence report remains a trusted server-boundary input, while actual
Docker tree termination is covered separately by supervisor and Core host tests.

All scoped fault triggers are dropped in `finally`; fixture rows are cleaned using
their own workspace/user IDs. The two test files pass repository scoped lint.
