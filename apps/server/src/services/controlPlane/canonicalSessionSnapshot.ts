import { createHash, randomUUID } from 'node:crypto';

import type { Commitment, ControlResult, DurableReceipt } from '@orvilo/agent-execution';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { legacyStatusExpr } from '@/database/models/taskExecutionSql';
import {
  acceptances,
  taskDependencies,
  tasks,
  trashItems,
  verifyCheckResults,
  verifyRuns,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import type { CanonicalReceiptMapping } from './canonicalCompletion';
import {
  CanonicalRunAuthority,
  type CanonicalRunBinding,
  type CanonicalRunSnapshot,
} from './canonicalRun';

/** Same shape as journal 0199. Disposable tests apply it when the migration has not run. */
export const CORE_SESSION_SNAPSHOT_CANDIDATE_SQL = `CREATE TABLE IF NOT EXISTS core_session_snapshots (
 id text PRIMARY KEY, workspace_id text NOT NULL, user_id text NOT NULL, task_id text NOT NULL,
 topic_id text NOT NULL, registration_id text NOT NULL, epoch bigint NOT NULL,
 captured_at bigint NOT NULL, digest text NOT NULL, snapshot jsonb NOT NULL
);`;

/** Configured by the trusted host. Neither commitments nor receipt loaders come from Prime. */
export interface CanonicalSessionEvidence {
  commitments: Commitment[];
  completionMappings: CanonicalReceiptMapping[];
  /** Optional content identity only: it never supplies authority or completion evidence. */
  historyContentHash?: string;
  loadReceipts: () => Promise<DurableReceipt[]>;
}
export interface CanonicalSessionSnapshot {
  authority: {
    binding: CanonicalRunBinding;
    run: CanonicalRunSnapshot;
    commitments: Commitment[];
    completionMappings: CanonicalReceiptMapping[];
    receipts: DurableReceipt[];
    verification: Record<string, unknown>;
    dependencies: Record<string, unknown>[];
    tombstones: Record<string, unknown>[];
  };
  capturedAt: number;
  digest: string;
  historyContentHash?: string;
  id: string;
  schemaVersion: 1;
}
class SnapshotUnavailable extends Error {}
function fail(message: string): never {
  throw new SnapshotUnavailable(message);
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
    .join(',')}}`;
}
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');

/** Immutable observations, not transferable grants. Recovery always checks live authority. */
export class CanonicalSessionSnapshots {
  constructor(private readonly db: OrviloDatabase) {}

  private async observe(
    binding: CanonicalRunBinding,
    read: (run: CanonicalRunSnapshot, tx: OrviloDatabase) => Promise<CanonicalSessionSnapshot>,
  ): Promise<ControlResult<CanonicalSessionSnapshot>> {
    const result = await new CanonicalRunAuthority(this.db).withSnapshot(
      binding,
      async (run, tx): Promise<ControlResult<CanonicalSessionSnapshot>> => {
        try {
          return { ok: true, value: await read(run, tx) };
        } catch (error) {
          if (!(error instanceof SnapshotUnavailable)) throw error;
          return {
            ok: false,
            error: { code: 'verification_required', message: error.message, retryable: false },
          };
        }
      },
    );
    return result.ok ? result.value : result;
  }

  private async collect(
    tx: OrviloDatabase,
    binding: CanonicalRunBinding,
    run: CanonicalRunSnapshot,
    input: CanonicalSessionEvidence,
  ) {
    // Session snapshots are task-scoped (verify plan, acceptance, task
    // dependencies) — a conversation subject never reaches them.
    if (binding.subject.kind !== 'task') fail('Run subject is not a task execution');
    const taskId = binding.subject.taskId;
    if (input.historyContentHash !== undefined && !/^[a-f0-9]{64}$/.test(input.historyContentHash))
      fail('Invalid history content hash');
    const commitments = structuredClone(input.commitments).sort((a, b) => a.id.localeCompare(b.id));
    const mappings = structuredClone(input.completionMappings).sort((a, b) =>
      a.checkItemId.localeCompare(b.checkItemId),
    );
    if (
      !commitments.length ||
      new Set(commitments.map((c) => c.id)).size !== commitments.length ||
      commitments.some(
        (c) => !c.id || c.taskId !== taskId || !c.actionKinds.length || !c.postconditions.length,
      )
    )
      fail('Trusted commitments unavailable');
    const [verify] = await tx
      .select()
      .from(verifyRuns)
      .where(
        and(
          eq(verifyRuns.workspaceId, binding.workspaceId),
          eq(verifyRuns.operationId, binding.operationId),
        ),
      )
      .for('update')
      .limit(1);
    if (!verify?.planConfirmedAt || !verify.plan?.length)
      fail('Frozen canonical Verify plan unavailable');
    const [acceptance] = verify.acceptanceId
      ? await tx
          .select({
            id: acceptances.id,
            status: acceptances.status,
            subjectType: acceptances.subjectType,
            subjectId: acceptances.subjectId,
            updatedAt: acceptances.updatedAt,
          })
          .from(acceptances)
          .where(
            and(
              eq(acceptances.id, verify.acceptanceId),
              eq(acceptances.workspaceId, binding.workspaceId),
            ),
          )
          .for('update')
          .limit(1)
      : [];
    if (
      verify.acceptanceId &&
      (!acceptance ||
        !(
          (acceptance.subjectType === 'task' && acceptance.subjectId === taskId) ||
          (acceptance.subjectType === 'topic' && acceptance.subjectId === binding.topicId)
        ))
    )
      fail('Canonical acceptance scope unavailable');
    const required = verify.plan.filter((item) => item.required);
    if (
      !required.length ||
      mappings.length !== required.length ||
      new Set(mappings.map((m) => m.checkItemId)).size !== mappings.length ||
      required.some(
        (item) =>
          !item.sourceCriterionId ||
          !mappings.some(
            (m) =>
              m.checkItemId === item.id &&
              m.sourceCriterionId === item.sourceCriterionId &&
              m.requestDigest &&
              m.receiptId,
          ),
      )
    )
      fail('Explicit criterion receipt mapping unavailable');
    const checks = await tx
      .select({
        id: verifyCheckResults.id,
        checkItemId: verifyCheckResults.checkItemId,
        sourceCriterionId: verifyCheckResults.sourceCriterionId,
        status: verifyCheckResults.status,
        verdict: verifyCheckResults.verdict,
        userDecision: verifyCheckResults.userDecision,
        userDecisionDetail: verifyCheckResults.userDecisionDetail,
      })
      .from(verifyCheckResults)
      .where(
        and(
          eq(verifyCheckResults.verifyRunId, verify.id),
          eq(verifyCheckResults.workspaceId, binding.workspaceId),
        ),
      )
      .for('update');
    const edges = await tx
      .select()
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.workspaceId, binding.workspaceId),
        ),
      )
      .for('update');
    const dependencyIds = [...new Set(edges.map((e) => e.dependsOnId))].sort();
    const prerequisites = dependencyIds.length
      ? await tx
          .select({
            id: tasks.id,
            status: sql<string>`${legacyStatusExpr}`,
            domainRevision: tasks.domainRevision,
            requirementRevision: tasks.requirementRevision,
            policyRevision: tasks.policyRevision,
            isDeleted: tasks.isDeleted,
            deletedAt: tasks.deletedAt,
            currentTopicId: tasks.currentTopicId,
          })
          .from(tasks)
          .where(and(inArray(tasks.id, dependencyIds), eq(tasks.workspaceId, binding.workspaceId)))
          .for('update', { noWait: true })
      : [];
    if (prerequisites.length !== dependencyIds.length)
      fail('Dependency unavailable in canonical scope');
    const ids = [taskId, binding.topicId, ...dependencyIds];
    const tombstones = await tx
      .select({
        id: trashItems.id,
        resourceId: trashItems.resourceId,
        resourceType: trashItems.resourceType,
        deletedAt: trashItems.deletedAt,
        rootId: trashItems.rootId,
      })
      .from(trashItems)
      .where(
        and(eq(trashItems.workspaceId, binding.workspaceId), inArray(trashItems.resourceId, ids)),
      )
      .for('update');
    const receipts = structuredClone(await input.loadReceipts()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (new Set(receipts.map((r) => r.id)).size !== receipts.length)
      fail('Duplicate receipt identities');
    for (const receipt of receipts) {
      const commitment = commitments.find((c) => c.id === receipt.commitmentId);
      if (
        !receipt.id ||
        !['prepared', 'applied', 'verified', 'failed', 'outcome_unknown'].includes(
          receipt.status,
        ) ||
        receipt.schemaVersion !== 1 ||
        !receipt.requestDigest ||
        !commitment ||
        !commitment.actionKinds.includes(receipt.actionKind) ||
        stable(receipt.fence) !== stable(run.fence)
      )
        fail('Durable receipt identity unavailable');
    }
    for (const mapping of mappings)
      if (
        !receipts.some(
          (receipt) =>
            receipt.id === mapping.receiptId && receipt.requestDigest === mapping.requestDigest,
        )
      )
        fail('Mapped receipt unavailable');
    // Include every receipt, including ambiguous/pending work. Never silently filter a source fence.
    const reloaded = structuredClone(await input.loadReceipts()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (digest(reloaded) !== digest(receipts)) fail('Receipt changed while observing authority');
    return {
      binding: structuredClone(binding),
      run,
      commitments,
      completionMappings: mappings,
      receipts,
      verification: {
        id: verify.id,
        operationId: verify.operationId,
        acceptanceId: verify.acceptanceId,
        acceptance: acceptance ?? null,
        roundIndex: verify.roundIndex,
        plan: verify.plan,
        planConfirmedAt: verify.planConfirmedAt,
        status: verify.status,
        userDecision: verify.userDecision,
        decisionDetail: verify.decisionDetail,
        checks: checks.sort((a, b) => a.id.localeCompare(b.id)),
      },
      dependencies: edges
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((edge) => ({
          id: edge.id,
          dependsOnId: edge.dependsOnId,
          type: edge.type,
          condition: edge.condition,
          task: prerequisites.find((task) => task.id === edge.dependsOnId),
        })),
      tombstones: tombstones.sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  capture(
    binding: CanonicalRunBinding,
    evidence: CanonicalSessionEvidence,
  ): Promise<ControlResult<CanonicalSessionSnapshot>> {
    binding = structuredClone(binding);
    evidence = {
      ...evidence,
      commitments: structuredClone(evidence.commitments),
      completionMappings: structuredClone(evidence.completionMappings),
    };
    return this.observe(binding, async (run, tx) => {
      const authority = await this.collect(tx, binding, run, evidence);
      // Narrowed in `collect` — the snapshot's task_id never stores a placeholder.
      const snapshotTaskId =
        binding.subject.kind === 'task' ? binding.subject.taskId : 'unreachable';
      const snapshot: CanonicalSessionSnapshot = {
        schemaVersion: 1,
        id: randomUUID(),
        capturedAt: Date.now(),
        digest: digest(authority),
        authority,
        ...(evidence.historyContentHash ? { historyContentHash: evidence.historyContentHash } : {}),
      };
      await tx.execute(
        sql`INSERT INTO core_session_snapshots(id,workspace_id,user_id,task_id,topic_id,registration_id,epoch,captured_at,digest,snapshot) VALUES (${snapshot.id},${binding.workspaceId},${binding.userId},${snapshotTaskId},${binding.topicId},${binding.runtimeRegistrationId},${binding.executionEpoch},${snapshot.capturedAt},${snapshot.digest},${JSON.stringify(snapshot)}::jsonb)`,
      );
      return snapshot;
    });
  }

  /** Re-read and admit only the same current canonical state; never installs saved authority. */
  recover(
    binding: CanonicalRunBinding,
    snapshotId: string,
    evidence: CanonicalSessionEvidence,
  ): Promise<ControlResult<CanonicalSessionSnapshot>> {
    binding = structuredClone(binding);
    evidence = {
      ...evidence,
      commitments: structuredClone(evidence.commitments),
      completionMappings: structuredClone(evidence.completionMappings),
    };
    return this.observe(binding, async (run, tx) => {
      // Narrowed: the canonical task admission already rejected non-task subjects.
      const snapshotTaskId =
        binding.subject.kind === 'task' ? binding.subject.taskId : 'unreachable';
      const result = await tx.execute(
        sql`SELECT snapshot FROM core_session_snapshots WHERE id=${snapshotId} AND workspace_id=${binding.workspaceId} AND user_id=${binding.userId} AND task_id=${snapshotTaskId} AND topic_id=${binding.topicId} AND registration_id=${binding.runtimeRegistrationId} AND epoch=${binding.executionEpoch}`,
      );
      const saved = result.rows[0]?.snapshot as CanonicalSessionSnapshot | undefined;
      if (
        !saved ||
        saved.schemaVersion !== 1 ||
        saved.id !== snapshotId ||
        saved.historyContentHash !== evidence.historyContentHash ||
        digest(saved.authority) !== saved.digest
      )
        fail('Saved canonical snapshot unavailable');
      const authority = await this.collect(tx, binding, run, evidence);
      if (digest(authority) !== saved.digest)
        fail('Canonical snapshot stale; capture current state explicitly');
      return saved;
    });
  }
}
