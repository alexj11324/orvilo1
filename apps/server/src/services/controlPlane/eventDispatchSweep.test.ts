// @vitest-environment node
import { createHmac, randomUUID } from 'node:crypto';

import { getTestDB } from '@orvilo/database/test-utils';
import type { ExecAgentResult, McpEventBinding } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agents,
  mcpEventBindings,
  mcpEventInbox,
  mcpEventTriggerRuns,
  mcpEventTriggers,
  resourcePermissions,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  userConnectors,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { AiAgentService } from '@/server/services/aiAgent';
import { McpEventDispatchAdmissionService } from '@/server/services/mcpEvents/admission';
import { createMcpEventsSql } from '@/server/services/mcpEvents/database';
import { SqlMcpEventBindingRepository, SqlMcpEventInbox } from '@/server/services/mcpEvents/inbox';
import { McpEventReceiver } from '@/server/services/mcpEvents/receiver';
import { sweepMcpEventInbox } from '@/server/services/mcpEvents/runtime';

describe('signed callback through the server admission sweep', () => {
  const secret = Buffer.alloc(32, 9);
  let db: OrviloDatabase;
  let userId: string;
  let workspaceId: string;
  let taskId: string;
  let tenantId: string;
  let bindingId: string;
  let token: string;
  let receiver: McpEventReceiver;
  let connectorId: string;
  let agentId: string;
  let topicId: string;

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
    taskId = `task_${randomUUID()}`;
    tenantId = `tenant_${randomUUID()}`;
    bindingId = `binding_${randomUUID()}`;
    token = `token_${randomUUID()}`;
    agentId = `agt_${randomUUID()}`;
    connectorId = randomUUID();
    topicId = `tpc_${randomUUID()}`;
    await db.insert(users).values({ id: userId });
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Signed sweep',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
    await db.insert(userConnectors).values({
      id: connectorId,
      identifier: 'mcp-source',
      name: 'Signed event source',
      sourceType: 'custom',
      status: 'connected',
      userId,
      workspaceId,
    });
    await db.insert(agents).values({ id: agentId, slug: agentId, userId, workspaceId });
    await db.insert(resourcePermissions).values({
      accessLevel: 'use',
      createdBy: userId,
      resourceId: agentId,
      resourceType: 'agent',
      userId,
      workspaceId,
    });
    await db.insert(topics).values({ agentId, id: topicId, userId, workspaceId });
    vi.spyOn(AiAgentService.prototype, 'execAgent').mockResolvedValue({
      agentId,
      assistantMessageId: 'msg-assistant',
      autoStarted: true,
      createdAt: new Date().toISOString(),
      message: 'started',
      operationId: `op_${randomUUID()}`,
      status: 'started',
      success: true,
      timestamp: new Date().toISOString(),
      topicId,
      userMessageId: 'msg-user',
    } satisfies ExecAgentResult);
    await db.insert(tasks).values({
      assigneeAgentId: agentId,
      assigneeUserId: userId,
      automationMode: 'event',
      config: { model: 'test-model', provider: 'test-provider' },
      createdByUserId: userId,
      id: taskId,
      identifier: 'EVT-SIGNED',
      instruction: 'signed',
      seq: 1,
      workspaceId,
    });
    const binding: McpEventBinding = {
      callbackToken: token,
      callbackUrl: 'https://receiver.test/events/token',
      connectorId,
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
      sourceId: connectorId,
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
    vi.restoreAllMocks();
    await db.delete(mcpEventTriggerRuns).where(eq(mcpEventTriggerRuns.tenantId, tenantId));
    await db.delete(mcpEventTriggers).where(eq(mcpEventTriggers.tenantId, tenantId));
    await db.delete(mcpEventInbox).where(eq(mcpEventInbox.tenantId, tenantId));
    await db.delete(mcpEventBindings).where(eq(mcpEventBindings.tenantId, tenantId));
    await db.delete(taskTopics).where(eq(taskTopics.workspaceId, workspaceId));
    await db.delete(taskDispatches).where(eq(taskDispatches.workspaceId, workspaceId));
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(topics).where(eq(topics.workspaceId, workspaceId));
    await db.delete(agents).where(eq(agents.userId, userId));
    await db.delete(userConnectors).where(eq(userConnectors.workspaceId, workspaceId));
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

    const swept = await sweepMcpEventInbox(db);
    expect(swept).toMatchObject({ claimed: 1, completed: 1, retried: 0 });
    expect(await dispatchIds()).toHaveLength(1);
    expect(await db.select().from(taskTopics).where(eq(taskTopics.taskId, taskId))).toHaveLength(1);
    expect(await sweepMcpEventInbox(db)).toMatchObject({ claimed: 0 });
    expect(await dispatchIds()).toHaveLength(1);
  });

  it('reuses the same dispatch after a lost admission acknowledgement', async () => {
    expect(await (await receiver.receive(signedRequest(occurrence()), token)).json()).toEqual({
      code: 'accepted',
    });
    const real = new McpEventDispatchAdmissionService(db);
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

    const resumed = await sweepMcpEventInbox(db, new McpEventDispatchAdmissionService(db));
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
    expect(await db.select().from(taskTopics).where(eq(taskTopics.taskId, taskId))).toHaveLength(1);
  });
});
