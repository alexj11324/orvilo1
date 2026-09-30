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
