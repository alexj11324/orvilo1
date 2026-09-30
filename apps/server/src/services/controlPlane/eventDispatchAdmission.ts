import type {
  EventDispatchAdmission,
  EventDispatchAdmissionRequest,
  EventDispatchAdmissionResult,
  IsolationEvidence,
} from '@orvilo/agent-execution/controlPlane';
import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane';
import { verifiedIsolation } from '@orvilo/agent-execution/controlPlane/server';
import { isRecord } from '@orvilo/utils/object';
import { and, eq, isNull, ne } from 'drizzle-orm';

import {
  TaskDispatchIdempotencyConflictError,
  TaskDispatchModel,
  TaskDispatchNotFoundError,
} from '@/database/models/taskDispatch';
import {
  executionGrants,
  mcpEventBindings,
  mcpEventInbox,
  mcpEventTriggerRuns,
  mcpEventTriggers,
  taskDispatches,
  taskExecutionHandoffs,
  tasks,
  taskTopics,
  workspaceMembers,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { matchesMcpEventFilters } from '@/server/services/mcpEvents/filter';

import {
  type CausationLink,
  decideCausation,
  decideReplayGap,
  MAX_EVENT_CAUSATION_DEPTH,
} from './eventDispatchPolicy';

const denied = (
  reason: Extract<EventDispatchAdmissionResult, { status: 'denied' }>['reason'],
): EventDispatchAdmissionResult => ({ status: 'denied', reason });

const waiting = (
  reason: Extract<EventDispatchAdmissionResult, { status: 'waiting' }>['reason'],
): EventDispatchAdmissionResult => ({ status: 'waiting', reason, retryable: true });

const nonempty = (value: string) => value.trim().length > 0;

/**
 * Recheck the durable inbox and authority, then enter TaskDispatch.
 * Isolation evidence is injected by a trusted host. Without it this returns
 * waiting and does not occupy the task. It never calls TaskRunner.
 */
export function createCoreEventDispatchAdmission(dependencies: {
  db: OrviloDatabase;
  isolation?: IsolationEvidence;
  now?: () => number;
}): EventDispatchAdmission {
  const now = dependencies.now ?? Date.now;
  return {
    async admit(request: EventDispatchAdmissionRequest): Promise<EventDispatchAdmissionResult> {
      if (request.schemaVersion !== CONTROL_PLANE_VERSION) return denied('unsupported-version');
      if (
        !nonempty(request.eventId) ||
        !nonempty(request.idempotencyKey) ||
        !nonempty(request.inboxRef) ||
        !nonempty(request.sourceId) ||
        !nonempty(request.subscriptionId) ||
        !nonempty(request.taskId) ||
        !nonempty(request.tenantId) ||
        !nonempty(request.triggerId) ||
        !nonempty(request.userId) ||
        !nonempty(request.workspaceId) ||
        !Number.isSafeInteger(request.triggerRevision) ||
        request.triggerRevision < 0
      ) {
        return denied('invalid-event');
      }

      const [joined] = await dependencies.db
        .select({
          binding: mcpEventBindings,
          inbox: mcpEventInbox,
          run: mcpEventTriggerRuns,
          trigger: mcpEventTriggers,
        })
        .from(mcpEventInbox)
        .innerJoin(
          mcpEventTriggerRuns,
          and(
            eq(mcpEventTriggerRuns.inboxId, mcpEventInbox.id),
            eq(mcpEventTriggerRuns.tenantId, mcpEventInbox.tenantId),
            eq(mcpEventTriggerRuns.idempotencyKey, request.idempotencyKey),
          ),
        )
        .innerJoin(
          mcpEventTriggers,
          and(
            eq(mcpEventTriggers.id, mcpEventTriggerRuns.triggerId),
            eq(mcpEventTriggers.tenantId, mcpEventTriggerRuns.tenantId),
          ),
        )
        .innerJoin(
          mcpEventBindings,
          and(
            eq(mcpEventBindings.id, mcpEventTriggers.subscriptionId),
            eq(mcpEventBindings.tenantId, mcpEventTriggers.tenantId),
            eq(mcpEventBindings.connectorId, mcpEventTriggers.sourceId),
          ),
        )
        .where(eq(mcpEventInbox.id, request.inboxRef))
        .limit(1);
      if (!joined) return denied('invalid-event');

      const { binding, inbox, run, trigger } = joined;
      if (inbox.tenantId !== request.tenantId || trigger.tenantId !== request.tenantId) {
        return denied('tenant-mismatch');
      }
      if (
        inbox.eventId !== request.eventId ||
        inbox.delivery.event.eventId !== request.eventId ||
        inbox.connectorId !== request.sourceId ||
        inbox.subscriptionId !== request.subscriptionId ||
        trigger.id !== request.triggerId ||
        trigger.taskId !== request.taskId ||
        trigger.sourceId !== request.sourceId ||
        trigger.subscriptionId !== request.subscriptionId ||
        binding.connectorId !== request.sourceId ||
        binding.id !== request.subscriptionId
      ) {
        return denied('invalid-event');
      }
      if (trigger.workspaceId !== request.workspaceId || trigger.userId !== request.userId) {
        return denied('tenant-mismatch');
      }
      if (
        run.triggerRevision !== request.triggerRevision ||
        trigger.revision !== run.triggerRevision
      ) {
        return denied('stale-binding');
      }
      const expiresAt = binding.binding.expiresAt;
      if (
        !trigger.enabled ||
        binding.state !== 'active' ||
        binding.binding.state !== 'active' ||
        (expiresAt !== null && expiresAt <= now())
      ) {
        return denied('revoked');
      }
      const replay = decideReplayGap({ truncated: binding.binding.truncated === true });
      if (replay) return denied(replay);
      if (
        !isRecord(inbox.delivery.event.data) ||
        !matchesMcpEventFilters(inbox.delivery.event.data, trigger.filters)
      ) {
        return denied('invalid-event');
      }

      const [task] = await dependencies.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, request.taskId))
        .limit(1);
      if (!task || task.isDeleted || task.deletedAt) return denied('invalid-event');
      if (task.workspaceId !== request.workspaceId) return denied('tenant-mismatch');

      const [member] = await dependencies.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, request.workspaceId),
            eq(workspaceMembers.userId, request.userId),
            isNull(workspaceMembers.deletedAt),
            isNull(workspaceMembers.suspendedAt),
          ),
        )
        .limit(1);
      if (!member) return denied('tenant-mismatch');

      const grants = await dependencies.db
        .select({
          expiresAt: executionGrants.expiresAt,
          revokedAt: executionGrants.revokedAt,
          status: executionGrants.status,
        })
        .from(executionGrants)
        .where(
          and(
            eq(executionGrants.taskId, request.taskId),
            eq(executionGrants.workspaceId, request.workspaceId),
            eq(executionGrants.delegationSubjectId, request.userId),
          ),
        );
      const activeGrant = grants.some((grant) => {
        const expiry = grant.expiresAt ? new Date(grant.expiresAt).getTime() : Number.NaN;
        return (
          grant.status === 'active' && !grant.revokedAt && Number.isFinite(expiry) && expiry > now()
        );
      });
      if (!activeGrant) return denied('revoked');

      const causation = await loadCausation(dependencies.db, request.causationId);
      const causationDecision = decideCausation({
        causationId: request.causationId,
        links: causation,
        rootDispatchId: request.rootDispatchId,
        workspaceId: request.workspaceId,
      });
      if (causationDecision) return denied(causationDecision);

      const leased =
        inbox.status === 'processing' && inbox.leaseUntil !== null && inbox.leaseUntil > now();
      if (!leased || run.status !== 'pending') return waiting('admission-held');

      const [handoff] = await dependencies.db
        .select({ id: taskExecutionHandoffs.id })
        .from(taskExecutionHandoffs)
        .where(
          and(
            eq(taskExecutionHandoffs.taskId, request.taskId),
            ne(taskExecutionHandoffs.phase, 'resumed'),
          ),
        )
        .limit(1);
      if (handoff) return waiting('admission-held');

      const registrations = await dependencies.db
        .select({ executionControl: taskTopics.executionControl })
        .from(taskTopics)
        .where(eq(taskTopics.taskId, request.taskId));
      if (
        registrations.some((row) => {
          const state = row.executionControl?.state;
          return state === 'held' || state === 'registering' || state === 'running';
        })
      ) {
        return waiting('admission-held');
      }

      if (!verifiedIsolation(dependencies.isolation)) return waiting('runtime-unavailable');

      try {
        const result = await new TaskDispatchModel(dependencies.db, request.workspaceId).request({
          idempotencyKey: request.idempotencyKey,
          initiator: `mcp-event:${request.triggerId}`,
          requestedBy: request.userId,
          sourceDispatchId: request.causationId,
          taskId: request.taskId,
          trigger: 'event',
        });
        if (result.state === 'busy') return waiting('admission-held');
        if (result.state === 'created') {
          return { status: 'accepted', dispatchId: result.dispatch.id };
        }
        return { status: 'duplicate', dispatchId: result.dispatch.id };
      } catch (error) {
        if (error instanceof TaskDispatchIdempotencyConflictError) {
          return denied('idempotency-conflict');
        }
        if (error instanceof TaskDispatchNotFoundError) return denied('invalid-event');
        throw error;
      }
    },
  };
}

async function loadCausation(
  db: OrviloDatabase,
  causationId: string | undefined,
): Promise<CausationLink[]> {
  if (!causationId) return [];
  const links: CausationLink[] = [];
  const seen = new Set<string>();
  let current: string | null = causationId;
  while (current && links.length < MAX_EVENT_CAUSATION_DEPTH) {
    if (seen.has(current)) {
      links.push({ id: current, sourceDispatchId: current, workspaceId: null });
      break;
    }
    const [row] = await db
      .select({
        id: taskDispatches.id,
        sourceDispatchId: taskDispatches.sourceDispatchId,
        workspaceId: taskDispatches.workspaceId,
      })
      .from(taskDispatches)
      .where(eq(taskDispatches.id, current))
      .limit(1);
    if (!row) break;
    links.push(row);
    seen.add(row.id);
    current = row.sourceDispatchId;
  }
  return links;
}
