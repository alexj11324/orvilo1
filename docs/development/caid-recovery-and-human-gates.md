# P16 — CAID recovery and human gates

Verification record for the plan item `feat/caid-recovery-and-human-gates`
(deps: P13 `feat/caid-completion-driven-scheduler`, P15
`feat/caid-verified-integration`). The survey covered every failure surface the
item names: self-retry loops, unauthorized recovery, late completion events,
receipt invalidation, goal stop, and unconfirmable physical state.

## Existing guarantees (audited, unchanged)

- **New attempts, same chain.** `TaskRecoveryCoordinator` issues each retry as a
  new attempt bound to `goalTaskAttempt(generation, goalId, taskId,
taskRevision)` idempotency keys, carries `lastErrorCode`/`lastError` evidence
  from the failed dispatch, and caps retries at
  `resolveTaskAttemptBudget(goal)` (default 3) plus `goal.maxTotalCost`.
- **No self-retry loop.** `decideNextMove` short-circuits to `pending_decision`
  whenever a failure decision is already open, so the same repeated error opens
  exactly one human gate.
- **Human decisions are not auto-bypassed.** `statusAuthoredByActor` respects a
  manual `pausedBy` marker; pause/stop is the stop boundary a tick cannot
  overwrite, and a goal deletion fences outstanding claims by lock + pause +
  CAS re-checks on manager/supervisor state.
- **Late completions cannot double-write.** A finishing run settles through the
  `settle` CAS (fence + generation + operation identity), and completion
  delivery is claimed once via `completionReservationId` before
  `integrateOnComplete` proceeds (P15).
- **Receipt invalidation propagates.** `expectedHeadSha`/`expectedBaseSha` pin
  every downstream read: a rolled-back head makes `snapshot.headSha !==
expectedHeadSha` and the record waits rather than completing the new
  generation on stale evidence (P15).
- **Unconfirmable physical state.** `claimForRecovery` parks an expired-lease
  dispatch in `outcome_unknown` until reconciliation answers, instead of
  treating a possibly-still-running process as a retryable failure.

## Changes in this PR

### Goal stop is a dispatch-level fence

`taskDispatches` rows carry no `goalId` — goal membership lives on
`goal_nodes.taskId` — so a queued dispatch could be resumed by any non-goal
trigger (heartbeat, schedule, orchestrator, a successor claim) while its owning
goal was paused or stopped. `TaskDispatchModel` now joins
`goal_nodes → goals` in `goalDispatchWaitingReason` and treats a goal in
`paused | canceled | failed | achieved` as a stop boundary at every boundary an
automated trigger can cross:

- `request()` — both the idempotent waiting-row resume and the fresh-dispatch
  insert path now resolve `goal_<status>` as a `waitingReason`. A parked
  dispatch resumes on the next request once the goal runs again (the row stays
  'waiting', never 'canceled' — a canceled row would deadlock idempotent
  re-request, which returns 'existing' rows as-is).
- `claimForProvisioning()` — a stop landing between request and claim parks the
  row back to 'waiting' instead of provisioning paid work.
- `transition()` — the execution-boundary CAS re-checks the owner before
  entering `provisioning`/`dispatched`/`running`.

A `manual` trigger bypasses the fence, matching how it already bypasses project
policy — a user starting a task with their own hands is the override.

Regression coverage: `packages/database/src/models/__tests__/taskDispatch.test.ts`
→ `goal dispatch fence` (new dispatch parked, manual bypass, same-dispatch
resume, stray-trigger re-park, claim-time park, transition-time park).

### Bounded verification polling in the delivery review sweep

`runTaskDeliveryReviewSweep` could wait forever on reads that never succeed:
missing remote branch, PR identity that cannot be established, an unverifiable
snapshot, a merge-boundary re-read that fails, or a post-merge confirmation
that stays unreadable — every pass logged and waited again, spending the
10-minute sweep budget on a credential or permission that does not self-heal.

`TaskTopicIntegration.verificationPollFailures` now counts consecutive
remote-observation failures (jsonb field, no migration). At
`MAX_VERIFICATION_POLL_FAILURES` (10) the record transitions to `blocked` with
`lastErrorCode: 'remote_verification_unavailable'` and surfaces as a human gate
instead of spinning. A successful remote read resets the counter, so transient
outages keep their budget across passes rather than accumulating toward a cap.

Coverage: `reviewController.cases.ts` adds counter-below-cap waiting, cap→
`blocked`, and reset-on-success; an exception mid-review routes through the
same bound via the sweep's catch.

## Explicitly unchanged

- Business-gate waits (`!isRemotePrMergeReady`, moved delivery head, pending
  CI) stay unbounded — they are real remote state, not read failures, and are
  already covered by the corrective-run and human-decision paths.
- `mergePullRequest` rejections keep waiting instead of counting toward the
  poll bound: the merge attempt read succeeded; a persistent rejection surfaces
  through `lastMergeError` in the review context for the next corrective loop.
