// @vitest-environment node
import { randomUUID } from 'node:crypto';

import type {
  EventDispatchAdmissionRequest,
  IsolationEvidence,
} from '@orvilo/agent-execution/controlPlane';
import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane';
import { getTestDB } from '@orvilo/database/test-utils';
import type { McpEventBinding } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agents,
  executionGrants,
  mcpEventBindings,
  mcpEventInbox,
  mcpEventTriggerRuns,
  mcpEventTriggers,
  taskDispatches,
  tasks,
  taskTopics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { createCoreEventDispatchAdmission } from './eventDispatchAdmission';

const isolation = {
  credentialsExcluded: true,
  enforced: true,
  filesystem: true,
  network: true,
  processes: true,
  sanitizedEnvironment: true,
  supervisorId: 'fixture-supervisor',
  treeId: 'fixture-tree',
} satisfies IsolationEvidence;

describe('core event dispatch admission', () => {
  let db: OrviloDatabase;
  let now: number;
  let userId: string;
  let workspaceId: string;
  let agentId: string;
  let taskId: string;
  let otherTaskId: string;
  let tenantId: string;
  let bindingId: string;
  let triggerId: string;
  let inboxId: string;
  let runKey: string;

  const request = (
    overrides: Partial<EventDispatchAdmissionRequest> = {},
  ): EventDispatchAdmissionRequest => ({
    eventId: 'event-1',
    idempotencyKey: runKey,
    inboxRef: inboxId,
    schemaVersion: CONTROL_PLANE_VERSION,
    sourceId: 'connector',
    subscriptionId: bindingId,
    taskId,
    tenantId,
    triggerId,
    triggerRevision: 0,
    userId,
    workspaceId,
    ...overrides,
  });

  const admit = (
    overrides: Partial<EventDispatchAdmissionRequest> = {},
    evidence?: IsolationEvidence,
  ) =>
    createCoreEventDispatchAdmission({
      db,
      isolation: evidence,
      now: () => now,
    }).admit(request(overrides));

  const dispatchRows = () =>
    db
      .select({ id: taskDispatches.id })
      .from(taskDispatches)
      .where(eq(taskDispatches.taskId, taskId));

  beforeEach(async () => {
    db = await getTestDB();
    now = 1_700_000_000_000;
    userId = `user_${randomUUID()}`;
    workspaceId = `ws_${randomUUID()}`;
    agentId = `agt_${randomUUID()}`;
    taskId = `tsk_${randomUUID()}`;
    otherTaskId = `tsk_${randomUUID()}`;
    tenantId = `tenant_${randomUUID()}`;
    bindingId = `binding_${randomUUID()}`;
    triggerId = `trigger_${randomUUID()}`;
    inboxId = `inbox_${randomUUID()}`;
    runKey = `event:${triggerId}:event-1`;

    await db.insert(users).values({ id: userId });
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Event admission',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
    await db.insert(agents).values({
      id: agentId,
      slug: agentId,
      userId,
      workspaceId,
    });
    await db.insert(tasks).values([
      {
        createdByUserId: userId,
        id: taskId,
        identifier: 'EVT-1',
        instruction: 'event',
        seq: 1,
        workspaceId,
      },
      {
        createdByUserId: userId,
        id: otherTaskId,
        identifier: 'EVT-2',
        instruction: 'other',
        seq: 2,
        workspaceId,
      },
    ]);
    const binding: McpEventBinding = {
      callbackToken: bindingId,
      callbackUrl: 'https://receiver.test/events/token',
      connectorId: 'connector',
      cursor: null,
      eventArguments: {},
      eventName: 'message',
      expiresAt: null,
      id: bindingId,
      payloadSchema: {},
      remoteSubscriptionId: 'remote',
      revision: 0,
      schemaId: 'schema',
      signingKeys: [],
      state: 'active',
      tenantId,
      truncated: false,
    };
    await db.insert(mcpEventBindings).values({
      binding,
      callbackToken: binding.callbackToken,
      connectorId: binding.connectorId,
      id: binding.id,
      state: 'active',
      tenantId,
    });
    await db.insert(mcpEventTriggers).values({
      enabled: true,
      filters: [{ operator: 'contains', path: ['text'], value: 'hello' }],
      id: triggerId,
      revision: 0,
      sourceId: 'connector',
      subscriptionId: bindingId,
      taskId,
      tenantId,
      userId,
      workspaceId,
    });
    await db.insert(mcpEventInbox).values({
      availableAt: now,
      connectorId: 'connector',
      delivery: {
        bindingRevision: 0,
        connectorId: 'connector',
        event: {
          data: { text: 'hello' },
          eventId: 'event-1',
          name: 'message',
          timestamp: '2026-09-30T00:00:00Z',
        },
        payloadHash: 'hash',
        rawBodyBase64: 'e30=',
        receivedAt: now,
        schemaId: 'schema',
        subscriptionId: bindingId,
        tenantId,
      },
      eventId: 'event-1',
      id: inboxId,
      leaseUntil: now + 60_000,
      payloadHash: 'hash',
      receivedAt: now,
      schemaId: 'schema',
      status: 'processing',
      subscriptionId: bindingId,
      tenantId,
    });
    await db.insert(mcpEventTriggerRuns).values({
      id: `run_${randomUUID()}`,
      idempotencyKey: runKey,
      inboxId,
      status: 'pending',
      tenantId,
      triggerId,
      triggerRevision: 0,
    });
    await db.insert(executionGrants).values({
      agentId,
      allowedActions: ['run'],
      delegationSubjectId: userId,
      expiresAt: new Date(now + 60_000),
      id: `grant_${randomUUID()}`,
      initiatedBy: userId,
      status: 'active',
      taskId,
      workspaceId,
    });
  });

  afterEach(async () => {
    await db.delete(mcpEventTriggerRuns).where(eq(mcpEventTriggerRuns.tenantId, tenantId));
    await db.delete(mcpEventTriggers).where(eq(mcpEventTriggers.tenantId, tenantId));
    await db.delete(mcpEventInbox).where(eq(mcpEventInbox.tenantId, tenantId));
    await db.delete(mcpEventBindings).where(eq(mcpEventBindings.tenantId, tenantId));
    await db.delete(taskTopics).where(eq(taskTopics.workspaceId, workspaceId));
    await db.delete(taskDispatches).where(eq(taskDispatches.workspaceId, workspaceId));
    await db.delete(executionGrants).where(eq(executionGrants.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(agents).where(eq(agents.userId, userId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('enters TaskDispatch once and does not start a run', async () => {
    const admitted = await admit({}, isolation);
    expect(admitted).toMatchObject({ status: 'accepted' });
    if (admitted.status !== 'accepted') return;
    const replay = await admit({}, isolation);
    expect(replay).toEqual({ status: 'duplicate', dispatchId: admitted.dispatchId });
    const rows = await db
      .select({
        phase: taskDispatches.phase,
        requestedBy: taskDispatches.requestedBy,
      })
      .from(taskDispatches)
      .where(eq(taskDispatches.id, admitted.dispatchId));
    expect(rows).toEqual([{ phase: 'requested', requestedBy: `event:${userId}` }]);
    expect(await db.select().from(taskTopics).where(eq(taskTopics.taskId, taskId))).toEqual([]);
  });

  it('waits without a dispatch when isolation evidence is missing or incomplete', async () => {
    expect(await admit()).toEqual({
      reason: 'runtime-unavailable',
      retryable: true,
      status: 'waiting',
    });
    expect(await admit({}, { ...isolation, enforced: false })).toEqual({
      reason: 'runtime-unavailable',
      retryable: true,
      status: 'waiting',
    });
    expect(await dispatchRows()).toEqual([]);
  });

  it('denies stale, revoked, cross-tenant, truncated, and unauthorized events', async () => {
    await db
      .update(mcpEventTriggers)
      .set({ revision: 1 })
      .where(eq(mcpEventTriggers.id, triggerId));
    expect(await admit({}, isolation)).toEqual({ reason: 'stale-binding', status: 'denied' });

    await db
      .update(mcpEventTriggers)
      .set({ revision: 0, enabled: false })
      .where(eq(mcpEventTriggers.id, triggerId));
    expect(await admit({}, isolation)).toEqual({ reason: 'revoked', status: 'denied' });

    await db
      .update(mcpEventTriggers)
      .set({
        enabled: true,
        filters: [{ operator: 'equals', path: ['text'], value: 'nope' }],
      })
      .where(eq(mcpEventTriggers.id, triggerId));
    expect(await admit({}, isolation)).toEqual({ reason: 'invalid-event', status: 'denied' });
    await db
      .update(mcpEventTriggers)
      .set({ filters: [{ operator: 'contains', path: ['text'], value: 'hello' }] })
      .where(eq(mcpEventTriggers.id, triggerId));
    await db
      .update(mcpEventBindings)
      .set({ state: 'revoked' })
      .where(eq(mcpEventBindings.id, bindingId));
    expect(await admit({}, isolation)).toEqual({ reason: 'revoked', status: 'denied' });
    await db
      .update(mcpEventBindings)
      .set({ state: 'active' })
      .where(eq(mcpEventBindings.id, bindingId));

    expect(await admit({ tenantId: 'other-tenant' }, isolation)).toEqual({
      reason: 'tenant-mismatch',
      status: 'denied',
    });
    expect(await admit({ workspaceId: 'other-workspace' }, isolation)).toEqual({
      reason: 'tenant-mismatch',
      status: 'denied',
    });

    const [stored] = await db
      .select({ binding: mcpEventBindings.binding })
      .from(mcpEventBindings)
      .where(eq(mcpEventBindings.id, bindingId));
    await db
      .update(mcpEventBindings)
      .set({ binding: { ...stored.binding, truncated: true } })
      .where(eq(mcpEventBindings.id, bindingId));
    expect(await admit({}, isolation)).toEqual({ reason: 'invalid-event', status: 'denied' });
    await db
      .update(mcpEventBindings)
      .set({ binding: { ...stored.binding, truncated: false } })
      .where(eq(mcpEventBindings.id, bindingId));

    await db.delete(executionGrants).where(eq(executionGrants.taskId, taskId));
    expect(await admit({}, isolation)).toEqual({ reason: 'revoked', status: 'denied' });
    expect(await admit({ eventId: '' })).toEqual({ reason: 'invalid-event', status: 'denied' });
    expect(await dispatchRows()).toEqual([]);
  });

  it('denies an expired or unbounded grant', async () => {
    await db
      .update(executionGrants)
      .set({ expiresAt: new Date(now - 1) })
      .where(eq(executionGrants.taskId, taskId));
    expect(await admit({}, isolation)).toEqual({ reason: 'revoked', status: 'denied' });
    await db
      .update(executionGrants)
      .set({ expiresAt: null })
      .where(eq(executionGrants.taskId, taskId));
    expect(await admit({}, isolation)).toEqual({ reason: 'revoked', status: 'denied' });
    expect(await dispatchRows()).toEqual([]);
  });

  it('denies a causation cycle, a foreign cause, and a root the chain never reaches', async () => {
    const cause = randomUUID();
    const next = randomUUID();
    const dispatch = (
      id: string,
      sourceDispatchId: string | null,
      scopedWorkspace: string | null,
    ) => ({
      generation: 1,
      id,
      idempotencyKey: id,
      phase: 'succeeded' as const,
      policyRevision: 1,
      requestedBy: `manual:${userId}`,
      requirementRevision: 1,
      sourceDispatchId,
      taskId,
      taskRevision: 1,
      workspaceId: scopedWorkspace,
    });
    await db
      .insert(taskDispatches)
      .values([dispatch(cause, next, workspaceId), dispatch(next, cause, workspaceId)]);
    expect(await admit({ causationId: cause }, isolation)).toEqual({
      reason: 'loop',
      status: 'denied',
    });

    const foreign = randomUUID();
    await db.insert(taskDispatches).values(dispatch(foreign, null, null));
    expect(await admit({ causationId: foreign }, isolation)).toEqual({
      reason: 'tenant-mismatch',
      status: 'denied',
    });

    const root = randomUUID();
    await db.insert(taskDispatches).values(dispatch(root, null, workspaceId));
    expect(await admit({ causationId: root, rootDispatchId: cause }, isolation)).toEqual({
      reason: 'loop',
      status: 'denied',
    });
    expect(await dispatchRows()).toHaveLength(4);
    expect(
      await db
        .select({ id: taskDispatches.id })
        .from(taskDispatches)
        .where(eq(taskDispatches.phase, 'requested')),
    ).toEqual([]);
  });

  it('waits while the task already holds an execution registration', async () => {
    await db.insert(taskTopics).values({
      executionControl: {
        activeHandoffId: null,
        leaseExpiresAt: now + 60_000,
        leaseId: 'lease',
        ownerId: 'owner',
        registrationId: 'registration',
        sessionId: null,
        state: 'running',
        supervisorId: null,
        treeId: null,
        version: 1,
      },
      seq: 1,
      taskId,
      userId,
      workspaceId,
    });
    expect(await admit({}, isolation)).toEqual({
      reason: 'admission-held',
      retryable: true,
      status: 'waiting',
    });
    expect(await dispatchRows()).toEqual([]);
  });

  it('denies an idempotency key that already belongs to another task', async () => {
    await db.insert(taskDispatches).values({
      generation: 1,
      id: randomUUID(),
      idempotencyKey: runKey,
      phase: 'succeeded',
      policyRevision: 1,
      requestedBy: `manual:${userId}`,
      requirementRevision: 1,
      taskId: otherTaskId,
      taskRevision: 1,
      workspaceId,
    });
    expect(await admit({}, isolation)).toEqual({
      reason: 'idempotency-conflict',
      status: 'denied',
    });
    expect(await dispatchRows()).toEqual([]);
  });
});
