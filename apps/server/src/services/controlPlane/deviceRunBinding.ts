/**
 * Canonical binding for a Prime run executing on a resolved Device.
 *
 * The runtime owner is the device (`orvilo-device:<deviceId>`) and the
 * supervised process tree lives on that machine — the server keeps the same
 * canonical registration rows the embedded host uses (grant, epoch, lease,
 * fence) so the remote broker endpoint can re-run the identical authority
 * chain (`withRun` → `issueBindingExecution` → `createInferenceBroker`) for
 * every `broker.infer` the device's runner issues. The device never sends
 * binding fields: the endpoint re-derives them from the canonical rows keyed
 * by the bound credential's `operation_id` claim.
 */
import { and, eq } from 'drizzle-orm';

import { taskDispatches, tasks, taskTopics } from '@/database/schemas';
import { agentOperations } from '@/database/schemas/agentOperations';
import type { OrviloDatabase } from '@/database/type';

import type { CanonicalRunBinding } from './canonicalRun';

export const DEVICE_RUNTIME_OWNER_PREFIX = 'orvilo-device:';
export const deviceRuntimeOwnerId = (deviceId: string) =>
  `${DEVICE_RUNTIME_OWNER_PREFIX}${deviceId}`;

/** The device id a device-owned run was bound to, or null for non-device owners. */
export const deviceIdFromRuntimeOwner = (ownerId: string): string | null =>
  ownerId.startsWith(DEVICE_RUNTIME_OWNER_PREFIX)
    ? ownerId.slice(DEVICE_RUNTIME_OWNER_PREFIX.length) || null
    : null;

/**
 * Re-derive the `CanonicalRunBinding` a device-run admission registered, from
 * the same canonical rows `openEmbeddedDispatchHost` reads. Returns null when
 * no owned registration exists — the run was never admitted, it was fenced
 * off, or the operation id is not a canonical task run at all (chat subjects
 * carry no task context and must not mint a binding here).
 */
export const deriveDeviceRunBinding = async (
  db: OrviloDatabase,
  operationId: string,
): Promise<CanonicalRunBinding | null> => {
  const [operation] = await db
    .select()
    .from(agentOperations)
    .where(eq(agentOperations.id, operationId))
    .limit(1);
  if (!operation?.taskId || !operation.topicId) return null;

  const [task] = await db.select().from(tasks).where(eq(tasks.id, operation.taskId)).limit(1);
  if (!task || task.domainRevision === null || task.workspaceId === null || task.isDeleted)
    return null;

  const [dispatch] = await db
    .select()
    .from(taskDispatches)
    .where(
      and(eq(taskDispatches.operationId, operationId), eq(taskDispatches.taskId, operation.taskId)),
    )
    .limit(1);
  if (!dispatch) return null;

  const [topic] = await db
    .select({
      executionControl: taskTopics.executionControl,
      executionEpoch: taskTopics.executionEpoch,
      executionGrantId: taskTopics.executionGrantId,
    })
    .from(taskTopics)
    .where(and(eq(taskTopics.taskId, operation.taskId), eq(taskTopics.topicId, operation.topicId)))
    .limit(1);
  const control = topic?.executionControl;
  if (
    !topic?.executionGrantId ||
    !topic.executionEpoch ||
    !control ||
    control.state === 'stopped' ||
    !control.registrationId ||
    !control.ownerId ||
    !control.leaseId ||
    !deviceIdFromRuntimeOwner(control.ownerId)
  )
    return null;

  return {
    dispatchFence: dispatch.fence,
    dispatchId: dispatch.id,
    executionEpoch: topic.executionEpoch,
    generation: dispatch.generation,
    grantId: topic.executionGrantId,
    operationId,
    policyRevision: dispatch.policyRevision,
    runtimeLeaseId: control.leaseId,
    runtimeOwnerId: control.ownerId,
    runtimeRegistrationId: control.registrationId,
    stateRevision: task.domainRevision,
    taskId: operation.taskId,
    topicId: operation.topicId,
    userId: operation.userId,
    workspaceId: task.workspaceId,
  };
};
