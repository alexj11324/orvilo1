import { createHash, randomUUID } from 'node:crypto';

import type { AutomationRunResult, TaskTopicHandoff } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import { CredentialModel } from '@/database/models/credential';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
import { automationResultDeliveries, tasks, taskTopics } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import { enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';
import type { DeliverTaskResultParams } from '@/server/services/taskResultBridge';

import {
  automationResultWebhookConfigSchema,
  sendResultWebhook,
  validateResultWebhookEndpoint,
} from './transport';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 30_000;
const SUMMARY_LIMIT = 16_000;
type Delivery = typeof automationResultDeliveries.$inferSelect;

export const resultStatus = (
  reason: string,
  topicStatus: string,
): AutomationRunResult['status'] => {
  if (reason === 'max_steps' || reason === 'cost_limit' || reason === 'timeout') return 'limited';
  if (reason === 'interrupted' || topicStatus === 'canceled') return 'canceled';
  if (reason === 'error' || topicStatus === 'failed') return 'failed';
  if (reason === 'done' && topicStatus === 'completed') return 'succeeded';
  return 'unknown';
};

/** Persistent output stage. This service never starts an Agent or changes run settlement. */
export class AutomationResultDeliveryService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private scope() {
    return and(
      eq(automationResultDeliveries.userId, this.userId),
      this.workspaceId
        ? eq(automationResultDeliveries.workspaceId, this.workspaceId)
        : isNull(automationResultDeliveries.workspaceId),
    );
  }

  private readScope() {
    // Task permission is checked before exposing history; workspace members
    // can see a shared task's results even if another member executed it.
    return this.workspaceId
      ? eq(automationResultDeliveries.workspaceId, this.workspaceId)
      : this.scope();
  }

  private async wakeWorker(userId = this.userId): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        enqueueHatchetTask(HATCHET_TASK_NAMES.automationResultOutputSweep, {
          createdByUserId: userId,
          workspaceId: this.workspaceId,
        }),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 3000);
        }),
      ]);
    } catch {
      // The SQL outbox already committed; the independent minute sweep and
      // watchdog can recover even when the broker's acknowledgement is lost.
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  /** Called only after the lifecycle's fenced, authoritative settlement. */
  async enqueueSettledResult(params: DeliverTaskResultParams): Promise<void> {
    if (!params.topicId) return;
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).findById(
      params.taskId,
    );
    const topic = await new TaskTopicModel(this.db, this.userId, this.workspaceId).findByTopicId(
      params.topicId,
    );
    if (
      !task ||
      !topic ||
      topic.taskId !== task.id ||
      topic.operationId !== params.operationId ||
      !topic.stopReason ||
      !topic.resultReadyAt ||
      !topic.resultOutcome ||
      !['completed', 'failed', 'timeout', 'canceled'].includes(topic.status) ||
      (!task.automationMode && !topic.contract?.occurrence)
    ) {
      return;
    }

    const occurrence = topic.contract?.occurrence;
    const executionStatus = resultStatus(topic.stopReason, topic.status);
    const [existingResult] = await this.db
      .select({ payload: automationResultDeliveries.payload })
      .from(automationResultDeliveries)
      .where(
        and(
          this.scope(),
          eq(automationResultDeliveries.operationId, params.operationId),
          eq(automationResultDeliveries.destinationId, 'inbox'),
        ),
      )
      .limit(1);
    const payload: AutomationRunResult = existingResult?.payload ?? {
      completedAt: topic.resultReadyAt.toISOString(),
      evidence: {
        definitionVersionId: occurrence?.definition.definitionVersionId,
        dispatchId: topic.dispatchId ?? undefined,
        generation: topic.executionGeneration ?? undefined,
        occurrenceId: occurrence?.occurrenceId,
      },
      identifier: params.taskIdentifier,
      runId: params.operationId,
      status: executionStatus === 'limited' ? 'limited' : topic.resultOutcome,
      stopReason: topic.stopReason,
      // Assistant text is reported as data; it is never evidence of successful settlement.
      summary: (
        params.errorMessage ||
        (topic.handoff as TaskTopicHandoff | null)?.summary ||
        params.lastAssistantContent ||
        ''
      ).slice(0, SUMMARY_LIMIT),
      taskId: params.taskId,
      topicId: params.topicId,
      version: 1,
    };
    // Frozen config governs this result. Editing a definition cannot redirect a queued result.
    const config = occurrence?.definition.config as { resultWebhooks?: unknown } | undefined;
    const configured =
      config?.resultWebhooks !== undefined &&
      (!Array.isArray(config.resultWebhooks) || config.resultWebhooks.length > 0);
    const parsed =
      configured && Array.isArray(config?.resultWebhooks) && config.resultWebhooks.length === 1
        ? automationResultWebhookConfigSchema.safeParse(config.resultWebhooks[0])
        : undefined;
    const destination = parsed?.success ? parsed.data : undefined;
    const destinations = configured ? (['inbox', 'webhook'] as const) : (['inbox'] as const);
    const now = new Date();
    let pendingInserted = false;
    await this.db.transaction(async (tx) => {
      for (const channel of destinations) {
        const destinationId =
          channel === 'inbox' ? 'inbox' : (destination?.id ?? 'invalid-result-webhook');
        const id = `result-${createHash('sha256')
          .update(
            JSON.stringify([this.userId, this.workspaceId, params.operationId, destinationId]),
          )
          .digest('hex')}`;
        let endpoint: string | null = null;
        let invalid = channel === 'webhook' && !destination;
        if (channel === 'webhook' && destination) {
          try {
            endpoint = validateResultWebhookEndpoint(destination.url);
          } catch {
            invalid = true;
          }
        }
        const inserted = await tx
          .insert(automationResultDeliveries)
          .values({
            credentialId: channel === 'webhook' ? destination?.credentialId : undefined,
            deliveredAt: channel === 'inbox' ? now : undefined,
            destinationId,
            endpoint,
            error: invalid ? 'CONFIGURATION_INVALID' : undefined,
            id,
            nextAttemptAt: now,
            operationId: params.operationId,
            payload,
            status: channel === 'inbox' ? 'delivered' : invalid ? 'failed' : 'pending',
            taskId: params.taskId,
            topicId: params.topicId,
            userId: this.userId,
            workspaceId: this.workspaceId,
          })
          .onConflictDoNothing()
          .returning({ status: automationResultDeliveries.status });
        if (inserted.some((row) => row.status === 'pending')) pendingInserted = true;
      }
    });
    if (pendingInserted) await this.wakeWorker();
  }

  async list(taskId: string) {
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).findById(taskId);
    if (!task) throw new Error('Task not found');
    const deliveries = await this.db
      .select()
      .from(automationResultDeliveries)
      .where(and(this.readScope(), eq(automationResultDeliveries.taskId, taskId)))
      .orderBy(desc(automationResultDeliveries.createdAt))
      .limit(100);
    // No endpoint or credential reference in run-history responses.
    return deliveries.map(
      ({ credentialId: _credential, endpoint: _endpoint, leaseToken: _lease, ...row }) => row,
    );
  }

  async retry(id: string, acknowledgeUnknown = false): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(automationResultDeliveries)
      .where(and(this.readScope(), eq(automationResultDeliveries.id, id)));
    if (!row || !row.endpoint || !['unknown', 'failed'].includes(row.status)) return false;
    if (row.status === 'unknown' && !acknowledgeUnknown) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Delivery may already have succeeded; acknowledge possible duplicate output',
      });
    }
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).findById(row.taskId);
    if (!task) throw new Error('Task not found');
    const updated = await this.db
      .update(automationResultDeliveries)
      .set({
        attempts: 0,
        error: null,
        nextAttemptAt: new Date(),
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(
        and(
          this.readScope(),
          eq(automationResultDeliveries.id, id),
          eq(automationResultDeliveries.status, row.status),
        ),
      )
      .returning({ id: automationResultDeliveries.id });
    if (updated.length === 1) await this.wakeWorker(row.userId);
    return updated.length === 1;
  }

  private async authorization(delivery: Delivery): Promise<string | undefined> {
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).findById(
      delivery.taskId,
    );
    if (!task) throw new Error('AUTH_REVOKED');
    if (this.workspaceId) {
      const member = await getActiveWorkspaceMembershipRole(this.db, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      if (!member) throw new Error('AUTH_REVOKED');
    }
    if (!delivery.credentialId) return;
    const model = new CredentialModel(this.db, this.userId);
    const row = this.workspaceId
      ? await model.findWorkspaceReadableById(delivery.credentialId, this.workspaceId)
      : await model.findPersonalById(delivery.credentialId);
    if (!row || row.type !== 'kv-header') throw new Error('CREDENTIAL_UNAVAILABLE');
    const payload = await model.decryptPayload(row);
    if (!payload || !('values' in payload)) throw new Error('CREDENTIAL_UNAVAILABLE');
    const authorization = payload.values.Authorization;
    if (!authorization || /[\r\n]/.test(authorization)) throw new Error('CREDENTIAL_INVALID');
    return authorization;
  }

  /** Claim one short output request; no batch-wide lease covers slow Agent preparation. */
  async deliverDue(limit = 20): Promise<number> {
    const now = new Date();
    await this.db
      .update(automationResultDeliveries)
      .set({
        error: 'DELIVERY_RESULT_UNKNOWN',
        leaseToken: null,
        leaseExpiresAt: null,
        status: 'unknown',
        updatedAt: now,
      })
      .where(
        and(
          this.scope(),
          eq(automationResultDeliveries.status, 'delivering'),
          lte(automationResultDeliveries.leaseExpiresAt, now),
        ),
      );
    const due = await this.db
      .select()
      .from(automationResultDeliveries)
      .where(
        and(
          this.scope(),
          eq(automationResultDeliveries.status, 'pending'),
          lte(automationResultDeliveries.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(automationResultDeliveries.nextAttemptAt))
      .limit(Math.min(limit, 100));
    let delivered = 0;
    for (const row of due) {
      const leaseToken = randomUUID();
      const claimed = await this.db
        .update(automationResultDeliveries)
        .set({
          attempts: row.attempts + 1,
          leaseExpiresAt: new Date(Date.now() + LEASE_MS),
          leaseToken,
          status: 'delivering',
          updatedAt: new Date(),
        })
        .where(
          and(
            this.scope(),
            eq(automationResultDeliveries.id, row.id),
            eq(automationResultDeliveries.status, 'pending'),
            eq(automationResultDeliveries.attempts, row.attempts),
            lte(automationResultDeliveries.nextAttemptAt, new Date()),
          ),
        )
        .returning();
      if (claimed.length !== 1) continue;
      let outcome;
      try {
        const authorization = await this.authorization(row);
        // Credential resolution may be slow. Reassert ownership immediately
        // before the write; an expired lease may never initiate a side effect.
        const owned = await this.db
          .update(automationResultDeliveries)
          .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
          .where(
            and(
              this.scope(),
              eq(automationResultDeliveries.id, row.id),
              eq(automationResultDeliveries.leaseToken, leaseToken),
              eq(automationResultDeliveries.status, 'delivering'),
              gt(automationResultDeliveries.leaseExpiresAt, new Date()),
            ),
          )
          .returning({ id: automationResultDeliveries.id });
        if (owned.length !== 1) continue;
        outcome = await sendResultWebhook({
          authorization,
          deliveryId: row.id,
          endpoint: row.endpoint!,
          payload: row.payload,
        });
      } catch {
        outcome = { error: 'AUTH_OR_CREDENTIAL_UNAVAILABLE', status: 'failed' as const };
      }
      const status =
        outcome.status === 'retry'
          ? row.attempts + 1 < MAX_ATTEMPTS
            ? 'pending'
            : 'failed'
          : outcome.status;
      await this.db
        .update(automationResultDeliveries)
        .set({
          deliveredAt: status === 'delivered' ? new Date() : null,
          error: 'error' in outcome ? outcome.error : null,
          httpStatus: outcome.httpStatus,
          leaseExpiresAt: null,
          leaseToken: null,
          nextAttemptAt: new Date(Date.now() + Math.min(60_000 * 2 ** row.attempts, 3_600_000)),
          status,
          updatedAt: new Date(),
        })
        .where(
          and(
            this.scope(),
            eq(automationResultDeliveries.id, row.id),
            eq(automationResultDeliveries.leaseToken, leaseToken),
            eq(automationResultDeliveries.status, 'delivering'),
          ),
        );
      delivered += 1;
    }
    return delivered;
  }

  static async recoverDue(
    db: OrviloDatabase,
    options: { createdByUserId?: string; workspaceId?: string } = {},
  ): Promise<number> {
    await this.recoverMissingResults(db, options);
    const scopes = await db
      .selectDistinct({
        userId: automationResultDeliveries.userId,
        workspaceId: automationResultDeliveries.workspaceId,
      })
      .from(automationResultDeliveries)
      .where(
        and(
          options.createdByUserId
            ? eq(automationResultDeliveries.userId, options.createdByUserId)
            : undefined,
          options.createdByUserId
            ? options.workspaceId
              ? eq(automationResultDeliveries.workspaceId, options.workspaceId)
              : isNull(automationResultDeliveries.workspaceId)
            : undefined,
          or(
            and(
              eq(automationResultDeliveries.status, 'pending'),
              lte(automationResultDeliveries.nextAttemptAt, new Date()),
            ),
            and(
              eq(automationResultDeliveries.status, 'delivering'),
              lte(automationResultDeliveries.leaseExpiresAt, new Date()),
            ),
          ),
        ),
      )
      .limit(10);
    const counts = await Promise.all(
      scopes.map((scope) =>
        new AutomationResultDeliveryService(
          db,
          scope.userId,
          scope.workspaceId ?? undefined,
        ).deliverDue(1),
      ),
    );
    return counts.reduce((total, count) => total + count, 0);
  }

  /** Repair a crash between authoritative topic settlement and outbox insertion. */
  static async recoverMissingResults(
    db: OrviloDatabase,
    options: { createdByUserId?: string; workspaceId?: string } = {},
  ): Promise<number> {
    const outputConfig = sql`${taskTopics.contract}->'occurrence'->'definition'->'config'->'resultWebhooks'`;
    const candidates = await db
      .select({
        identifier: tasks.identifier,
        operationId: taskTopics.operationId,
        stopReason: taskTopics.stopReason,
        taskId: taskTopics.taskId,
        topicId: taskTopics.topicId,
        handoff: taskTopics.handoff,
        userId: taskTopics.userId,
        workspaceId: taskTopics.workspaceId,
      })
      .from(taskTopics)
      .innerJoin(tasks, eq(tasks.id, taskTopics.taskId))
      .where(
        and(
          inArray(taskTopics.status, ['completed', 'failed', 'timeout', 'canceled']),
          isNotNull(taskTopics.topicId),
          isNotNull(taskTopics.operationId),
          isNotNull(taskTopics.stopReason),
          isNotNull(taskTopics.resultReadyAt),
          isNotNull(taskTopics.resultOutcome),
          sql`jsonb_typeof(${taskTopics.contract}->'occurrence') = 'object'`,
          options.createdByUserId ? eq(taskTopics.userId, options.createdByUserId) : undefined,
          options.createdByUserId
            ? options.workspaceId
              ? eq(taskTopics.workspaceId, options.workspaceId)
              : isNull(taskTopics.workspaceId)
            : undefined,
          sql`(SELECT count(*) FROM ${automationResultDeliveries}
          WHERE ${automationResultDeliveries.operationId} = ${taskTopics.operationId}
          AND ${automationResultDeliveries.userId} = ${taskTopics.userId}
          AND ${automationResultDeliveries.workspaceId} IS NOT DISTINCT FROM ${taskTopics.workspaceId}
        ) < 1 + CASE WHEN ${outputConfig} IS NULL THEN 0
          WHEN jsonb_typeof(${outputConfig}) = 'array'
          THEN CASE WHEN jsonb_array_length(${outputConfig}) > 0 THEN 1 ELSE 0 END ELSE 1 END`,
        ),
      )
      .orderBy(asc(taskTopics.updatedAt))
      .limit(20);
    for (const candidate of candidates) {
      await new AutomationResultDeliveryService(
        db,
        candidate.userId,
        candidate.workspaceId ?? undefined,
      ).enqueueSettledResult({
        operationId: candidate.operationId!,
        reason: candidate.stopReason!,
        taskId: candidate.taskId,
        taskIdentifier: candidate.identifier,
        topicId: candidate.topicId!,
        lastAssistantContent: (candidate.handoff as TaskTopicHandoff | null)?.content,
      });
    }
    return candidates.length;
  }
}
