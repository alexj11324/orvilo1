// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatExecutionControlModel } from '@/database/models/chatExecutionControl';
import { agentOperations, tasks, topics, workspaceMembers, workspaces } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import { CanonicalChatRunAuthority, type CanonicalChatRunBinding } from './canonicalChatRun';
import { createCanonicalChatRunFixture } from './canonicalRun.test-utils';

/**
 * Real canonical schema, no mock authority — the chat-parallel of
 * `canonicalRun.test.ts`. The admitted contract is `agent_operations`
 * (status + metadata.executionControl) + the topic tombstone + workspace
 * membership; the operation status leaving 'running' IS the kill fence.
 */
describe('canonical chat run admission', () => {
  let db: OrviloDatabase;
  let binding: CanonicalChatRunBinding;
  beforeEach(async () => {
    db = await getTestDB();
    binding = await createCanonicalChatRunFixture(db);
  });
  afterEach(async () => {
    if (binding) {
      await db
        .delete(agentOperations)
        .where(eq(agentOperations.id, binding.operationId))
        .catch(() => {});
      if (binding.chatWorkspaceId)
        await db.delete(workspaces).where(eq(workspaces.id, binding.chatWorkspaceId));
      await cleanupTestUser(db, binding.userId);
    }
  });

  it('admits a live chat run and exposes the canonical snapshot', async () => {
    const result = await new CanonicalChatRunAuthority(db).withRun(
      binding,
      async (snapshot) => snapshot,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fence).toMatchObject({
      epoch: 1,
      grantId: binding.operationId,
      leaseId: binding.runtimeLeaseId,
      ownerId: binding.runtimeOwnerId,
      principalId: binding.userId,
      taskId: binding.taskId,
      tenantId: binding.workspaceId,
    });
    // Chat runs carry no grant row — no delegated actions are issued.
    expect(result.value.allowedActions).toEqual([]);
    expect(result.value.registrationState).toBe('running');
    expect(result.value.grantExpiresAt).toBe(binding.runExpiresAt);
  });

  it.each([
    'chatAgentId',
    'operationId',
    'topicId',
    'userId',
    'runtimeRegistrationId',
    'runtimeOwnerId',
    'runtimeLeaseId',
  ] as const)('denies a mismatched %s without invoking effects', async (field) => {
    const changed = { ...binding, [field]: 'foreign' };
    let called = false;
    const result = await new CanonicalChatRunAuthority(db).withRun(changed, async () => {
      called = true;
      return null;
    });
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
    expect(called).toBe(false);
  });

  it('denies a settled operation — the operation status is the kill fence', async () => {
    await db
      .update(agentOperations)
      .set({ status: 'done' })
      .where(eq(agentOperations.id, binding.operationId));
    let called = false;
    const result = await new CanonicalChatRunAuthority(db).withRun(binding, async () => {
      called = true;
      return null;
    });
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
    expect(called).toBe(false);
  });

  it('denies an operation bound to a task — chat admission is task-free', async () => {
    // taskId carries an FK to tasks — seed a real row the op could serve.
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: binding.userId,
        identifier: 'CHAT-1',
        instruction: 'x',
        seq: 1,
        status: 'running',
        workspaceId: binding.chatWorkspaceId!,
      })
      .returning();
    await db
      .update(agentOperations)
      .set({ taskId: task.id })
      .where(eq(agentOperations.id, binding.operationId));
    const result = await new CanonicalChatRunAuthority(db).withRun(binding, async () => 'admitted');
    expect(result.ok).toBe(false);
  });

  it('denies a deleted topic', async () => {
    await db.update(topics).set({ deletedAt: new Date() }).where(eq(topics.id, binding.topicId));
    const result = await new CanonicalChatRunAuthority(db).withRun(binding, async () => 'admitted');
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
  });

  it('denies a suspended workspace member', async () => {
    await db
      .update(workspaceMembers)
      .set({ suspendedAt: new Date() })
      .where(eq(workspaceMembers.workspaceId, binding.chatWorkspaceId!));
    const result = await new CanonicalChatRunAuthority(db).withRun(binding, async () => 'admitted');
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
  });

  it('denies once the bounded run window expires', async () => {
    const expired = { ...binding, runExpiresAt: Date.now() - 1 };
    const result = await new CanonicalChatRunAuthority(db).withRun(expired, async () => 'x');
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
  });

  it('denies effects after the registration stops', async () => {
    const registration = new ChatExecutionControlModel(db, binding.userId, binding.workspaceId);
    await registration.stop(binding);
    const result = await new CanonicalChatRunAuthority(db).withRun(binding, async () => 'x');
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
  });

  it('admits a registering owner to startup observation only', async () => {
    const registering = await createCanonicalChatRunFixture(db, { state: 'registering' });
    try {
      const runDenied = await new CanonicalChatRunAuthority(db).withRun(
        registering,
        async () => 'x',
      );
      expect(runDenied.ok).toBe(false);
      const startup = await new CanonicalChatRunAuthority(db).withRegistration(
        registering,
        async (snapshot) => snapshot,
      );
      expect(startup.ok).toBe(true);
      if (startup.ok) expect(startup.value.registrationState).toBe('registering');
    } finally {
      await db
        .delete(agentOperations)
        .where(eq(agentOperations.id, registering.operationId))
        .catch(() => {});
      if (registering.chatWorkspaceId)
        await db.delete(workspaces).where(eq(workspaces.id, registering.chatWorkspaceId));
      await cleanupTestUser(db, registering.userId);
    }
  });

  it('admits a personal-scope chat run under its synthetic tenant', async () => {
    const personal = await createCanonicalChatRunFixture(db, { workspace: false });
    try {
      const result = await new CanonicalChatRunAuthority(db).withRun(
        personal,
        async (snapshot) => snapshot,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fence.tenantId).toBe(`personal:${personal.userId}`);
        expect(personal.chatWorkspaceId).toBeNull();
      }
    } finally {
      await db
        .delete(agentOperations)
        .where(eq(agentOperations.id, personal.operationId))
        .catch(() => {});
      await cleanupTestUser(db, personal.userId);
    }
  });
});
