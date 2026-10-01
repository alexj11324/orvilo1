import type {
  DispatchAdmissionErrorCode,
  EventDispatchAdmission,
  EventDispatchAdmissionRequest,
  EventDispatchAdmissionResult,
} from '@orvilo/agent-execution/controlPlane';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import { TaskDispatchEventEvidenceError } from '@/database/models/taskDispatch';
import { taskDispatches } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import { TaskDispatchWaitingError } from '@/server/services/taskDispatch';
import { TaskRunnerService } from '@/server/services/taskRunner';

import { createMcpEventsSql } from './database';

const denied = (reason: DispatchAdmissionErrorCode): EventDispatchAdmissionResult => ({
  reason,
  status: 'denied',
});

/**
 * Trusted server adapter for the canonical `EventDispatchAdmission` port.
 * Resolves the durable trigger run the claim cites, then enters the existing
 * TaskDispatch/TaskRunner boundary — the shared claim transaction re-verifies
 * the evidence under the task lock, so nothing here is trusted on presence.
 * Never a second runner and never a client-reachable entry.
 */
export class McpEventDispatchAdmissionService implements EventDispatchAdmission {
  constructor(private readonly db: OrviloDatabase) {}

  async admit(request: EventDispatchAdmissionRequest): Promise<EventDispatchAdmissionResult> {
    if (request.schemaVersion !== 1) return denied('unsupported-version');
    if (
      !request.tenantId ||
      !request.workspaceId ||
      !request.userId ||
      !request.taskId ||
      !request.triggerId ||
      !request.sourceId ||
      !request.subscriptionId ||
      !request.eventId ||
      !request.inboxRef ||
      !request.idempotencyKey
    ) {
      return denied('invalid-event');
    }

    const database = createMcpEventsSql(this.db);
    const runs = await database.query<{
      dispatch_id: string | null;
      id: string;
      status: string;
    }>(
      `SELECT id,status,dispatch_id FROM mcp_event_trigger_runs
       WHERE tenant_id=$1 AND idempotency_key=$2 AND trigger_id=$3 AND inbox_id=$4 LIMIT 1`,
      [request.tenantId, request.idempotencyKey, request.triggerId, request.inboxRef],
    );
    const run = runs.rows[0];
    if (!run) return denied('invalid-event');
    if (run.status === 'accepted' && run.dispatch_id) {
      return { dispatchId: run.dispatch_id, status: 'duplicate' };
    }
    if (run.status !== 'pending') return denied('invalid-event');

    try {
      const result = await new TaskRunnerService(
        this.db,
        request.userId,
        request.workspaceId,
      ).runTask({
        eventEvidence: {
          causationIds: [request.causationId, request.rootDispatchId].filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
          eventId: request.eventId,
          idempotencyKey: request.idempotencyKey,
          inboxRef: request.inboxRef,
          sourceId: request.sourceId,
          subscriptionId: request.subscriptionId,
          tenantId: request.tenantId,
          triggerId: request.triggerId,
          triggerRevision: request.triggerRevision,
          triggerRunId: run.id,
          userId: request.userId,
          workspaceId: request.workspaceId,
        },
        idempotencyKey: request.idempotencyKey,
        requestedBy: request.userId,
        taskId: request.taskId,
        trigger: 'event',
      });
      return {
        dispatchId: result.dispatchId ?? '',
        operationId: result.operationId,
        status: 'accepted',
      };
    } catch (error) {
      const cause = error instanceof TRPCError ? error.cause : undefined;
      if (cause instanceof TaskDispatchEventEvidenceError) {
        return { reason: cause.code, status: 'denied' };
      }
      if (cause instanceof TaskDispatchWaitingError) {
        return { reason: 'admission-held', retryable: true, status: 'waiting' };
      }
      if (error instanceof TRPCError && error.code === 'CONFLICT') {
        const [existing] = await this.db
          .select({ id: taskDispatches.id, taskId: taskDispatches.taskId })
          .from(taskDispatches)
          .where(
            and(
              eq(taskDispatches.idempotencyKey, request.idempotencyKey),
              eq(taskDispatches.workspaceId, request.workspaceId),
            ),
          )
          .limit(1);
        if (existing?.taskId === request.taskId) {
          return { dispatchId: existing.id, status: 'duplicate' };
        }
        if (existing) return denied('idempotency-conflict');
        // The task is busy under another dispatch — the run stays pending
        // and retries once the active claim settles.
        return { reason: 'admission-held', retryable: true, status: 'waiting' };
      }
      if (
        error instanceof TRPCError &&
        (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')
      ) {
        return denied('revoked');
      }
      return { reason: 'runtime-unavailable', retryable: true, status: 'waiting' };
    }
  }
}
