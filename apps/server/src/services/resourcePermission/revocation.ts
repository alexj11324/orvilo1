import { TERMINAL_AGENT_OPERATION_STATUSES } from '@orvilo/types';
import { and, eq, inArray, notInArray } from 'drizzle-orm';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { agentOperations, taskDispatches } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { AiAgentService } from '@/server/services/aiAgent';

/** Revoke execution for the caller, preserving each Run's pinned host and identity. */
export const stopRevokedCallerOperations = async (
  db: OrviloDatabase,
  scope: { agentId?: string; operationIds?: string[]; userId: string; workspaceId: string },
) => {
  const operations = await db
    .select({ id: agentOperations.id })
    .from(agentOperations)
    .where(
      and(
        eq(agentOperations.userId, scope.userId),
        eq(agentOperations.workspaceId, scope.workspaceId),
        scope.agentId ? eq(agentOperations.agentId, scope.agentId) : undefined,
        scope.operationIds ? inArray(agentOperations.id, scope.operationIds) : undefined,
        notInArray(agentOperations.status, [...TERMINAL_AGENT_OPERATION_STATUSES]),
      ),
    );
  if (operations.length === 0) return;
  const dispatches = await db
    .select()
    .from(taskDispatches)
    .where(
      and(
        eq(taskDispatches.workspaceId, scope.workspaceId),
        inArray(
          taskDispatches.operationId,
          operations.map(({ id }) => id),
        ),
        inArray(taskDispatches.phase, [
          'claimed',
          'provisioning',
          'dispatched',
          'running',
          'waiting',
          'outcome_unknown',
          'cancel_requested',
        ]),
      ),
    );
  const model = new TaskDispatchModel(db, scope.workspaceId);
  for (const dispatch of dispatches) {
    await model.requestStop({
      dispatchId: dispatch.id,
      fence: dispatch.fence,
      generation: dispatch.generation,
      operationId: dispatch.operationId,
      reason: 'caller_authorization_revoked',
    });
  }
  const service = new AiAgentService(db, scope.userId, { workspaceId: scope.workspaceId });
  // The existing cancellation sweep owns Issue settlement. A request alone never
  // writes a terminal Task/Run status; Chat retains its remote cancel ledger.
  await Promise.all(operations.map(({ id }) => service.interruptTask({ operationId: id })));
};

/** Snapshot before deletion clears the Agent/topic foreign keys. */
export const snapshotWorkspaceAgentOperations = async (
  db: OrviloDatabase,
  scope: { agentId: string; workspaceId: string },
) =>
  db
    .select({ id: agentOperations.id, userId: agentOperations.userId })
    .from(agentOperations)
    .where(
      and(
        eq(agentOperations.agentId, scope.agentId),
        eq(agentOperations.workspaceId, scope.workspaceId),
        notInArray(agentOperations.status, [...TERMINAL_AGENT_OPERATION_STATUSES]),
      ),
    );

/** Stop the existing callers before deleting or transferring their Agent scope. */
export const stopWorkspaceAgentOperations = async (
  db: OrviloDatabase,
  scope: { agentId: string; workspaceId: string },
  snapshot?: Array<{ id: string; userId: string }>,
) => {
  const operations = snapshot ?? (await snapshotWorkspaceAgentOperations(db, scope));
  await Promise.all(
    [...new Set(operations.map(({ userId }) => userId))].map((userId) =>
      stopRevokedCallerOperations(db, {
        operationIds: operations
          .filter((operation) => operation.userId === userId)
          .map(({ id }) => id),
        userId,
        workspaceId: scope.workspaceId,
      }),
    ),
  );
};
