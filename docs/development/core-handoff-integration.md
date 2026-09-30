# Core handoff and completion integration checkpoint

Baseline: `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`.

The transferred Core sources are candidate boundary code, not a second task runner or a production completion implementation. The original handoff and verification files were restored from the supplied text after HTML entity decoding, checked using `git apply --check`, and verified against the supplied Git blob hashes:

- `handoff.ts`: 126 lines, `c495d3cefa2f5e80d109cde1c90c6e370ad8fd6c`.
- `verification.ts`: 72 lines, `caf930b6e5dce0b82dea93b5ee74d4d18ea54e31`.

## Existing authority that must be reused

| Concern                       | Existing owner                                                                                          | Integration constraint                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dispatch identity and replay  | `packages/database/src/models/taskDispatch.ts`, `request`                                               | Reuse the existing idempotency identity and generation; do not create a second dispatch for handoff replay.                                                             |
| Provisioning lease and fence  | `TaskDispatchModel.claimForProvisioning`                                                                | Locks dispatch and task, checks workspace, requirement and policy revisions, generation, and assignee before increasing the dispatch fence.                             |
| Uncertain execution recovery  | `TaskDispatchModel.claimForRecovery`                                                                    | Retains the same fence and marks `outcome_unknown`; reconciliation is explicitly prohibited from launching a second process. This is not a handoff transfer operation.  |
| Delegated execution authority | `apps/server/src/services/agentDelegation/executionGrants.ts`, `claimExecutionEpoch`, `assertMayCommit` | Epoch is on the `(taskId, topicId)` run row and bound to the execution grant. It is not the dispatch fence or task execution generation.                                |
| Runtime settlement            | `TaskDispatchModel.settle`                                                                              | Settles a dispatch, checks generation and contract, and parks stale task contracts. It does not prove deliverable acceptance.                                           |
| Final accepted completion     | `apps/server/src/services/verify/settle.ts`, `driveTaskFromVerify`                                      | Uses the exact operation and topic, Verify verdict, task-drive lease, completion reservation and integration gate. Preserve this convergence and its recovery behavior. |

## Missing canonical binding

The transferred `ExecutionFence` contains a task ID and abstract owner/lease/epoch. It does not identify the dispatch ID/fence/generation, operation ID, topic ID, or completion reservation. Those identities are independently meaningful in the current application. Treating one `epoch` value as all of them would admit stale work.

Likewise, `VerificationEvidence` and `AuthoritativeVerification` introduce commitments, action receipts, accepted decisions and tombstones. No supplied adapter maps these to canonical Verify criteria/check results/run verdicts, task dependencies and existing tombstones within the required transaction. A task-ID-only `CompletionPersistence` adapter would bypass existing integration and acceptance checks.

A production adapter therefore needs an explicit, server-resolved run binding and typed receipt-to-Verify mapping before it can safely invoke the canonical settlement path. Handoff additionally requires durable mutation admission held across process-tree quiescence, atomic successor registration and owner/epoch transfer, and retry-safe process registration. No substitute authority table, synthetic task identity, migration number or alternate completed-status write was introduced in this checkpoint.

## Boundary fixes

The coordinator now rejects transfer results that change the original handoff identity, source fence, intended successor, schema version or revision progression. Successor policy and state revisions remain the responsibility of the canonical transaction, which may legitimately advance them during transfer. Completion validation now rejects a tombstoned dependency task even if its former acceptance ID remains present.

The added boundary tests exercise those negative cases. They are coordinator/validator tests, not SQL recovery, live OS isolation, or production runtime evidence. At restoration time, original `contracts.ts` was missing from the available transfer and prevented module loading; no passing test claim is made here.

## Canonical adapters added in the cloud

`apps/server/src/services/controlPlane/canonicalRun.ts` now reads and locks the actual task dispatch, task, execution grant, task topic and workspace membership rows. Its trusted server binding keeps dispatch fence/generation distinct from delegated epoch and operation/topic identity. It reuses `AgentDelegationService.assertMayCommit` on the same transaction connection. It admits only explicitly bounded user-delegated running dispatches with live leases, exact assignee and contract identity; unsupported/unleased registrations deny. No production runtime ownership is inferred merely from a provisioning or reconciliation lease.

`canonicalCompletion.ts` resolves the actual passed and confirmed Verify plan and its persisted passed checks, and requires an explicit server-owned mapping to verified durable receipts for every required criterion. It neither invents a passed verdict nor accepts runtime output as a verdict. Missing mapping denies. The final authorization is forwarded through `driveTaskFromVerify`, `TaskService.updateStatus`, and `TaskModel.updateStatusForExecutionContract` as an optional trusted `beforeMutation` hook. That hook runs in the task status CAS transaction and locks/rechecks dispatch, task, grant, topic epoch, member, Verify run and results, including a recheck after asynchronous receipt loading. It does not hold an outer transaction over Verify convergence. Existing non-Core callers retain their prior behavior.

The adapter reads actual task status after convergence: recurring tasks that rearm remain explicitly uncompleted. This hook fences the final completion mutation; it is not a blanket authorization wrapper around every earlier Verify integration/publishing side effect. Those actions continue to require their existing authorization and integration gates.

Linux acceptance now includes:

- Actual PostgreSQL canonical run admission: 12 passed, including a second connection calling the real `TaskDispatchModel.requestStop` while an admitted callback is held. Cancellation commits after the callback releases its locks, and subsequent stale-owner admission denies.
- Actual PGlite canonical completion: 10 passed in 21.16 seconds. The public reconciliation path invokes real Verify convergence and completes a passed mapped run; a takeover during receipt loading leaves it running; capped recurring runs complete only with valid authorization, remaining scheduled on revocation. Other tests exercise the actual task-model CAS transaction, missing mapping, missing frozen plan, foreign operation and superseded dispatch.
- The authority schema and Verify services are real. Receipt loading in completion tests supplies explicit trusted fixture receipts; SQL receipt durability is covered separately in `core-sql-receipts.md`.
- ESLint completed without errors or warnings for the new adapters and three modified canonical files.

## Remaining durable handoff design

No runtime owner transfer was implemented by repurposing the dispatch recovery lease. The minimum identified schema change is two additive columns on canonical `task_topics`: a typed nullable `executionControl` record and `executionControlRevision`, plus one `task_execution_handoffs` intent/history table. The canonical record would hold process owner, opaque runtime lease/expiry, registration identity, held/running/stopped state, registered tree/supervisor/session and active handoff ID. Existing `executionEpoch` and `executionGrantId` remain the sole delegated epoch/grant. Existing `task_topics.handoff` is an LLM summary and stays untouched.

Before enabling transfer, Core registration, admission, recovery, revocation and cancellation must all respect that record; older ACP writers cannot be considered fenced merely by adding a table. Successor registration must atomically consume the durable transfer identity and reconcile ambiguous launch outcomes. The present stop/drain path uses the existing dispatch cancellation fence; it proves stop, not successor transfer. No schema columns, new handoff table or numbered migration have been created in this checkpoint.

Independent validation subsequently ran the 10 completion cases against disposable actual PostgreSQL: all passed in 27.24 seconds. Existing Verify regressions also passed (`driveTaskFromVerify`: 28, `taskAcceptance`: 4, `lifecycle`: 3). The all-dependency strict typecheck traverses the real Verify/TaskService graph into Desktop/UI modules and does not pass in this scoped configuration: it reports missing Electron/desktop aliases and unrelated ambient/UI errors. It also found the new test fixture used operation status `completed`; that fixture was corrected to canonical operation status `done`. The adapter and modified production hook files had no reported diagnostics. This is not a full-repository typecheck pass.
