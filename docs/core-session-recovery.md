# Authoritative session observations and limited recovery

Orvilo's `CanonicalSessionSnapshots` persists immutable observations in the candidate
`core_session_snapshots` table. This is one additional table, with no numbered migration
or production installation. The table is separate from Prime history files.

Capture and inspection run through the actual canonical run guard in a serializable
transaction. They bind the task, workspace, user, registered owner, lease, epoch,
state/policy revisions, trusted host commitments, frozen Verify plan and decisions,
dependency state, deletion records, explicit criterion-to-receipt mappings, and every
receipt in the host namespace. Missing mappings or a foreign receipt fence deny;
unmapped ambiguous receipts cannot be silently discarded. A saved snapshot never
installs its old authority. Recovery must match the currently authorized canonical
state and durable receipts; a changed state requires explicit fresh capture.

The optional SHA-256 of a Prime history file is content identity only. It does not
supply commitments, decisions, permissions or evidence that a task completed.

## Receipt recovery

`createActionReceiptRecovery` accepts only the original action identity and current
serialized authority. It has a read-only verifier and no `apply` or reservation path.
A verified receipt is returned without repeating its effect. For prepared, applied,
or outcome-unknown receipts, a mandatory trusted check must keep the original writer
stopped and its effects drained before recovery can claim ownership. SQL ownership
rotation and receipt CAS prevent an old adapter's delayed save from overwriting the
result. A failed postcondition, expired authority, conflicting receipt or uncertain
quiescence remains blocked. Repeated reconciliation is allowed; mutation replay is not.

The file receipt adapter deliberately has no takeover operation. The concrete host
continues blocking its incomplete receipts rather than pretending it has distributed
CAS. The SQL reconciliation capability is an explicit trusted server operation, not a
background retry loop or an exposed agent endpoint. Cross-epoch receipt adoption is
unsupported; saved authority cannot authorize it.

## Execution remains distinct

`CanonicalCoreRuntimeHost.captureRecoverySnapshot` and `inspectRecoverySnapshot`
provide host-only metadata operations. `resumeFromSnapshot` returns `outcome_unknown`
when receipts are not verified, and `unsupported_capability` even when the observation
is valid and receipts are verified. It cannot call ACP `session/load`, recreate Python
memory, or restart an ambiguous writer. Existing `PrimeExecutionRuntime.capabilities()`
continues reporting `resume:none` and `loadSession:false`.

The earlier [nonempty history experiment](../scripts/acceptance/prime-nonempty.md)
proves cold-container history and tool-record loading, not safe execution recovery.
The supported continuation boundary is a separately authorized fresh ACP session,
with selected historical context and authority retained outside the kernel.

No Provider or Events adapter is required for these local recovery observations.
Actual model inference, cross-branch dispatch integration, production runner enablement
and coordinated migration installation remain outside this candidate.

## Linux acceptance evidence

The [PostgreSQL evidence report](development/core-recovery-postgres-evidence.md)
records the exact fixture environment, command and later fixture-only type corrections.

On 2026-09-30 the targeted receipt suites passed 45 tests. They exercise actual
filesystem effects and durable SQL receipts, with no recovery call to `apply`.
The dedicated `receiptRecovery.postgres.test.ts` passed **9/9** against actual
PostgreSQL, including server restart with a changed postmaster start time and
persistent fixture storage. It verifies:

- An effect whose acknowledgement was lost is reconciled by a read-only digest
  check; file contents and inode demonstrate that recovery did not write again.
- An original writer's otherwise valid `prepared → applied` save is rejected after
  recovery claims ownership, while the receipt is still `prepared` and the verifier
  is gated before completion. This isolates token fencing from terminal-state checks.
- Policy changes deny receipt recovery. Host close/database restart/host reopen
  preserve the saved snapshot; unresolved receipts block execution, and a valid
  verified snapshot still returns `unsupported_capability` for ACP resume.
- Receipt progression, changed decisions/dependencies, task deletion, missing mappings,
  history-hash mismatch, and missing/unknown snapshot schema versions deny stale reuse.

The PostgreSQL suite uses real canonical guards, receipts, snapshot storage, and the
file capability. Its process-isolation evidence is explicitly a trusted boundary
fixture: the old file writer is closed before reconciliation. It does **not** claim
that this suite launched Prime or proved a kernel's pending effects drained. Actual
Prime process-tree evidence remains in the earlier host/handoff acceptance. A real
runtime reconciliation caller must supply the mandatory trusted quiescence check;
if that cannot be established, recovery remains blocked.

The soft-deletion guards also passed the affected actual PostgreSQL admission and
completion regressions (28 tests) and handoff regressions (14 tests). Scoped lint
passed. The independent review found no production defect; its late-callback evidence
concern was addressed by the pre-completion token-fencing assertion above. This test
improvement was author-validated, not a second independent review round.

The restart suite is deliberately opt-in through `CORE_RECOVERY_DATABASE_URL` and
checks the named container's acceptance label and loopback binding before restarting
it. It must use its own disposable `core_recovery` database/container and persistent
fixture volume, never a shared database. No Provider call, external subscription,
production migration, runtime enablement or publish occurred.

The final full dependency-graph comparison on source commit `3e7b9f0d` reports
7,854 diagnostics for both baseline and candidate, with zero added diagnostic sites.
The same three existing message-only type differences remain. This is not a full
repository typecheck pass; see [the exact comparison](core-typecheck-comparison.md).
