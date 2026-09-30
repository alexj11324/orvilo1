// @vitest-environment node
import { createHmac, randomUUID } from 'node:crypto';

import type { IsolationEvidence } from '@orvilo/agent-execution/controlPlane';
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
import { createCoreEventDispatchAdmission } from '@/server/services/controlPlane/eventDispatchAdmission';
import { createMcpEventsSql } from '@/server/services/mcpEvents/database';
import { SqlMcpEventBindingRepository, SqlMcpEventInbox } from '@/server/services/mcpEvents/inbox';
import { McpEventReceiver } from '@/server/services/mcpEvents/receiver';
import {
  sweepAuthoritativeMcpEventInbox,
  sweepMcpEventInbox,
} from '@/server/services/mcpEvents/runtime';

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

describe('authoritative MCP event sweep', () => {
  let db: OrviloDatabase;
  let userId: string;
  let workspaceId: string;
  let taskId: string;
  let tenantId: string;
  let bindingId: string;
  let triggerId: string;
  let inboxId: string;
  let grantId: string;

  beforeEach(async () => {
    db = await getTestDB();
    const now = Date.now();
    userId = `user_${randomUUID()}`;
    workspaceId = `ws_${randomUUID()}`;
    taskId = `tsk_${randomUUID()}`;
    tenantId = `tenant_${randomUUID()}`;
    bindingId = `binding_${randomUUID()}`;
    triggerId = `trigger_${randomUUID()}`;
    inboxId = `inbox_${randomUUID()}`;
    grantId = `grant_${randomUUID()}`;
    const agentId = `agt_${randomUUID()}`;

    await db.insert(users).values({ id: userId });
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Event sweep',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
    await db.insert(agents).values({ id: agentId, slug: agentId, userId, workspaceId });
    await db.insert(tasks).values({
      createdByUserId: userId,
      id: taskId,
      identifier: 'EVT-SWEEP',
      instruction: 'event',
      seq: 1,
      workspaceId,
    });
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
      connectorId: 'connector',
      id: bindingId,
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
      payloadHash: 'hash',
      receivedAt: now,
      schemaId: 'schema',
      status: 'pending',
      subscriptionId: bindingId,
      tenantId,
    });
    await db.insert(executionGrants).values({
      agentId,
      allowedActions: ['run'],
      delegationSubjectId: userId,
      expiresAt: new Date(now + 60_000),
      id: grantId,
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

  const inboxStatus = async () => {
    const [row] = await db
      .select({ attempts: mcpEventInbox.attempts, status: mcpEventInbox.status })
      .from(mcpEventInbox)
      .where(eq(mcpEventInbox.id, inboxId));
    return row;
  };

  it('leaves the inbox unclaimed when isolation evidence is absent', async () => {
    expect(await sweepAuthoritativeMcpEventInbox(db)).toEqual({
      claimed: 0,
      completed: 0,
      reason: 'runtime-unavailable',
      retried: 0,
      status: 'waiting',
    });
    expect(await sweepAuthoritativeMcpEventInbox(db, { ...isolation, enforced: false })).toEqual({
      claimed: 0,
      completed: 0,
      reason: 'runtime-unavailable',
      retried: 0,
      status: 'waiting',
    });
    expect(await inboxStatus()).toEqual({ attempts: 0, status: 'pending' });
    expect(await db.select().from(taskDispatches).where(eq(taskDispatches.taskId, taskId))).toEqual(
      [],
    );
  });

  it('claims one inbox row into exactly one TaskDispatch and does not start a run', async () => {
    const first = await sweepAuthoritativeMcpEventInbox(db, isolation);
    expect(first).toMatchObject({ claimed: 1, completed: 1, retried: 0 });
    const dispatches = await db
      .select({ phase: taskDispatches.phase, requestedBy: taskDispatches.requestedBy })
      .from(taskDispatches)
      .where(eq(taskDispatches.taskId, taskId));
    expect(dispatches).toEqual([{ phase: 'requested', requestedBy: `event:${userId}` }]);
    expect(await inboxStatus()).toMatchObject({ status: 'completed' });
    const runs = await db
      .select({ status: mcpEventTriggerRuns.status })
      .from(mcpEventTriggerRuns)
      .where(eq(mcpEventTriggerRuns.tenantId, tenantId));
    expect(runs).toEqual([{ status: 'accepted' }]);
    expect(await db.select().from(taskTopics).where(eq(taskTopics.taskId, taskId))).toEqual([]);

    const replay = await sweepAuthoritativeMcpEventInbox(db, isolation);
    expect(replay).toMatchObject({ claimed: 0, completed: 0, retried: 0 });
    expect(
      await db
        .select({ id: taskDispatches.id })
        .from(taskDispatches)
        .where(eq(taskDispatches.taskId, taskId)),
    ).toHaveLength(1);
  });

  it('records a denial and creates no dispatch when the grant is missing', async () => {
    await db.delete(executionGrants).where(eq(executionGrants.id, grantId));
    const result = await sweepAuthoritativeMcpEventInbox(db, isolation);
    expect(result).toMatchObject({ claimed: 1, completed: 1, retried: 0 });
    expect(await db.select().from(taskDispatches).where(eq(taskDispatches.taskId, taskId))).toEqual(
      [],
    );
    const runs = await db
      .select({ reason: mcpEventTriggerRuns.reason, status: mcpEventTriggerRuns.status })
      .from(mcpEventTriggerRuns)
      .where(eq(mcpEventTriggerRuns.tenantId, tenantId));
    expect(runs).toEqual([{ reason: 'revoked', status: 'denied' }]);
  });
});

describe('signed callback through authoritative sweep', () => {
  const secret = Buffer.alloc(32, 9);
  let db: OrviloDatabase;
  let userId: string;
  let workspaceId: string;
  let taskId: string;
  let tenantId: string;
  let bindingId: string;
  let token: string;
  let receiver: McpEventReceiver;

  const signedRequest = (raw: string, tamper = false) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret)
      .update(`event-signed.${timestamp}.`)
      .update(raw)
      .digest('base64');
    return new Request('https://receiver.test/events/token', {
      body: raw + (tamper ? ' ' : ''),
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'event-signed',
        'webhook-signature': `v1,${signature}`,
        'webhook-timestamp': timestamp,
        'x-mcp-subscription-id': 'remote-signed',
      },
      method: 'POST',
    });
  };

  const occurrence = () =>
    JSON.stringify({
      data: { text: 'hello signed callback' },
      eventId: 'event-signed',
      name: 'message',
      timestamp: new Date().toISOString(),
    });

  beforeEach(async () => {
    db = await getTestDB();
    const now = Date.now();
    userId = `user_${randomUUID()}`;
    workspaceId = `ws_${randomUUID()}`;
    taskId = `tsk_${randomUUID()}`;
    tenantId = `tenant_${randomUUID()}`;
    bindingId = `binding_${randomUUID()}`;
    token = `token_${randomUUID()}`;
    const agentId = `agt_${randomUUID()}`;
    await db.insert(users).values({ id: userId });
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Signed sweep',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
    await db.insert(agents).values({ id: agentId, slug: agentId, userId, workspaceId });
    await db.insert(tasks).values({
      createdByUserId: userId,
      id: taskId,
      identifier: 'EVT-SIGNED',
      instruction: 'signed',
      seq: 1,
      workspaceId,
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
    const binding: McpEventBinding = {
      callbackToken: token,
      callbackUrl: 'https://receiver.test/events/token',
      connectorId: 'connector',
      cursor: null,
      eventArguments: {},
      eventName: 'message',
      expiresAt: null,
      id: bindingId,
      payloadSchema: { type: 'object' },
      remoteSubscriptionId: null,
      revision: 0,
      schemaId: 'schema',
      signingKeys: [{ secret: `whsec_${secret.toString('base64')}` }],
      state: 'pending',
      tenantId,
      truncated: false,
    };
    const sql = createMcpEventsSql(db);
    const bindings = new SqlMcpEventBindingRepository(sql);
    await bindings.createPending(binding);
    await bindings.verifyPending(token, 'remote-signed', 'challenge-signed', 'fresh', now);
    await bindings.update(binding, bindingId, 'pending', { state: 'active' }, 0);
    await db.insert(mcpEventTriggers).values({
      enabled: true,
      filters: [{ operator: 'contains', path: ['text'], value: 'hello' }],
      id: `trigger_${randomUUID()}`,
      revision: 0,
      sourceId: 'connector',
      subscriptionId: bindingId,
      taskId,
      tenantId,
      userId,
      workspaceId,
    });
    receiver = new McpEventReceiver({
      bindings,
      inbox: new SqlMcpEventInbox(sql),
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

  const dispatchIds = () =>
    db
      .select({ id: taskDispatches.id })
      .from(taskDispatches)
      .where(eq(taskDispatches.taskId, taskId));

  it('persists the signed body, then admits exactly one dispatch', async () => {
    const raw = occurrence();
    expect((await receiver.receive(signedRequest(raw, true), token)).status).toBe(401);
    expect(
      await db.select().from(mcpEventInbox).where(eq(mcpEventInbox.tenantId, tenantId)),
    ).toEqual([]);
    expect(await (await receiver.receive(signedRequest(raw), token)).json()).toEqual({
      code: 'accepted',
    });
    expect(await (await receiver.receive(signedRequest(raw), token)).json()).toEqual({
      code: 'duplicate',
    });
    const [stored] = await db
      .select({ delivery: mcpEventInbox.delivery, status: mcpEventInbox.status })
      .from(mcpEventInbox)
      .where(eq(mcpEventInbox.tenantId, tenantId));
    expect(stored?.status).toBe('pending');
    expect(stored?.delivery.rawBodyBase64).toBe(Buffer.from(raw).toString('base64'));

    const swept = await sweepAuthoritativeMcpEventInbox(db, isolation);
    expect(swept).toMatchObject({ claimed: 1, completed: 1, retried: 0 });
    expect(await dispatchIds()).toHaveLength(1);
    expect(await db.select().from(taskTopics).where(eq(taskTopics.taskId, taskId))).toEqual([]);
    expect(await sweepAuthoritativeMcpEventInbox(db, isolation)).toMatchObject({ claimed: 0 });
    expect(await dispatchIds()).toHaveLength(1);
  });

  it('reuses the same dispatch after a lost admission acknowledgement', async () => {
    expect(await (await receiver.receive(signedRequest(occurrence()), token)).json()).toEqual({
      code: 'accepted',
    });
    const real = createCoreEventDispatchAdmission({ db, isolation });
    let lost = false;
    const interrupted = await sweepMcpEventInbox(db, {
      async admit(request) {
        const result = await real.admit(request);
        if (!lost && result.status === 'accepted') {
          lost = true;
          throw new Error('admission acknowledgement lost');
        }
        return result;
      },
    });
    expect(lost).toBe(true);
    expect(interrupted).toMatchObject({ claimed: 1, completed: 0, retried: 1 });
    const created = await dispatchIds();
    expect(created).toHaveLength(1);
    await db
      .update(mcpEventInbox)
      .set({ availableAt: Date.now() })
      .where(eq(mcpEventInbox.tenantId, tenantId));

    const resumed = await sweepAuthoritativeMcpEventInbox(db, isolation);
    expect(resumed).toMatchObject({ claimed: 1, completed: 1, retried: 0 });
    expect(await dispatchIds()).toEqual(created);
    const runs = await db
      .select({
        dispatchId: mcpEventTriggerRuns.dispatchId,
        status: mcpEventTriggerRuns.status,
      })
      .from(mcpEventTriggerRuns)
      .where(eq(mcpEventTriggerRuns.tenantId, tenantId));
    expect(runs).toEqual([{ dispatchId: created[0]?.id, status: 'accepted' }]);
    expect(await db.select().from(taskTopics).where(eq(taskTopics.taskId, taskId))).toEqual([]);
  });
});
