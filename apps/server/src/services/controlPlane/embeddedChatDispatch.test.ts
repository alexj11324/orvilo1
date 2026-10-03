// @vitest-environment node
import { randomUUID } from 'node:crypto';

import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agentOperations,
  agents,
  tasks,
  topics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import {
  cleanupTestUser,
  createTestUser,
} from '@/server/routers/lambda/__tests__/integration/setup';

import {
  openEmbeddedChatDispatchHost,
  resolveEmbeddedChatDispatchRoute,
} from './embeddedChatDispatch';

/**
 * Chat admission seam: the route predicate is pure; `openEmbeddedChatDispatchHost`
 * re-proves the chat execution record against REAL rows (operation, topic,
 * membership) before composing the host — the contract denials are env-free,
 * and a live contract provably reaches artifact verification.
 */
describe('resolveEmbeddedChatDispatchRoute', () => {
  it('admits a chat-scoped orvilo run with full execution context', () => {
    expect(
      resolveEmbeddedChatDispatchRoute({
        agentId: 'agt_1',
        heteroType: 'orvilo',
        operationId: 'op_1',
        topicId: 'tpc_1',
      }),
    ).toEqual({ agentId: 'agt_1', operationId: 'op_1', topicId: 'tpc_1' });
  });

  it.each(['claude-code', 'codex', 'acp'] as const)('denies hetero type %s', (heteroType) => {
    expect(
      resolveEmbeddedChatDispatchRoute({
        agentId: 'a',
        heteroType,
        operationId: 'o',
        topicId: 't',
      }),
    ).toBeNull();
  });

  it('denies task-bound dispatches — the task route owns those', () => {
    expect(
      resolveEmbeddedChatDispatchRoute({
        agentId: 'a',
        heteroType: 'orvilo',
        operationId: 'o',
        operationTaskId: 'task_1',
        topicId: 't',
      }),
    ).toBeNull();
  });

  it.each(['agentId', 'operationId', 'topicId'] as const)(
    'denies a context-less run missing %s',
    (missing) => {
      const input = {
        agentId: 'a',
        heteroType: 'orvilo',
        operationId: 'o',
        topicId: 't',
      };
      delete (input as Record<string, unknown>)[missing];
      expect(resolveEmbeddedChatDispatchRoute(input)).toBeNull();
    },
  );
});

describe('openEmbeddedChatDispatchHost', () => {
  let db: OrviloDatabase;
  let seededUserId: string;
  let workspaceId: string | null;

  const seedChatRun = async (
    options: {
      operationStatus?: string;
      taskId?: string | null;
      topicDeleted?: boolean;
      memberSuspended?: boolean;
      workspace?: boolean;
    } = {},
  ) => {
    const userId = await createTestUser(db);
    seededUserId = userId;
    workspaceId = null;
    if (options.workspace !== false) {
      const [workspace] = await db
        .insert(workspaces)
        .values({ name: 'ChatDispatch', primaryOwnerId: userId, slug: randomUUID() })
        .returning();
      await db
        .insert(workspaceMembers)
        .values({ role: 'owner', userId, workspaceId: workspace.id });
      if (options.memberSuspended)
        await db
          .update(workspaceMembers)
          .set({ suspendedAt: new Date() })
          .where(eq(workspaceMembers.workspaceId, workspace.id));
      workspaceId = workspace.id;
    }
    const agentId = `agt_${randomUUID()}`;
    await db.insert(agents).values({ id: agentId, userId, workspaceId });
    const topicId = `tpc_${randomUUID()}`;
    await db.insert(topics).values({
      agentId,
      deletedAt: options.topicDeleted ? new Date() : null,
      id: topicId,
      userId,
      workspaceId,
    });
    const operationId = `op_${randomUUID()}`;
    let taskId: string | null = null;
    if (options.taskId && workspaceId) {
      // taskId carries an FK to tasks — seed a real row the op could serve.
      const [task] = await db
        .insert(tasks)
        .values({
          createdByUserId: userId,
          identifier: 'CHAT-T1',
          instruction: 'x',
          seq: 1,
          status: 'running',
          workspaceId,
        })
        .returning();
      taskId = task.id;
    }
    await db.insert(agentOperations).values({
      agentId,
      id: operationId,
      status: (options.operationStatus ?? 'running') as
        'done' | 'error' | 'interrupted' | 'running',
      taskId,
      topicId,
      userId,
      workspaceId,
    });
    return { agentId, operationId, topicId, userId };
  };

  beforeEach(async () => {
    db = await getTestDB();
  });

  afterEach(async () => {
    if (workspaceId) await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    if (seededUserId) await cleanupTestUser(db, seededUserId);
  });

  it('rejects a settled operation as stale', async () => {
    const run = await seedChatRun({ operationStatus: 'done' });
    const result = await openEmbeddedChatDispatchHost(
      { database: db, userId: run.userId },
      { agentId: run.agentId, operationId: run.operationId, topicId: run.topicId },
    );
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
  });

  it('rejects a task-bound operation — the task route owns it', async () => {
    const run = await seedChatRun({ taskId: 'task_1' });
    const result = await openEmbeddedChatDispatchHost(
      { database: db, userId: run.userId },
      { agentId: run.agentId, operationId: run.operationId, topicId: run.topicId },
    );
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
  });

  it('rejects a deleted topic', async () => {
    const run = await seedChatRun({ topicDeleted: true });
    const result = await openEmbeddedChatDispatchHost(
      { database: db, userId: run.userId },
      { agentId: run.agentId, operationId: run.operationId, topicId: run.topicId },
    );
    expect(result).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
  });

  it('rejects a suspended workspace member', async () => {
    const run = await seedChatRun({ memberSuspended: true });
    const result = await openEmbeddedChatDispatchHost(
      { database: db, userId: run.userId },
      { agentId: run.agentId, operationId: run.operationId, topicId: run.topicId },
    );
    expect(result).toMatchObject({ error: { code: 'policy_denied' }, ok: false });
  });

  it('admits a live workspace chat run past the contract into composition', async () => {
    const run = await seedChatRun();
    const result = await openEmbeddedChatDispatchHost(
      { database: db, userId: run.userId },
      {
        agentId: run.agentId,
        // A missing artifact reaches manifest verification — proving the
        // operation/topic/membership contract admitted (else stale_fence).
        environment: { artifact: '/definitely/missing/runner.mjs' },
        operationId: run.operationId,
        topicId: run.topicId,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('policy_denied');
    expect(result.error.message).toContain('manifest is not readable');
  });

  it('admits a personal-scope chat run under the synthetic tenant', async () => {
    const run = await seedChatRun({ workspace: false });
    const result = await openEmbeddedChatDispatchHost(
      { database: db, userId: run.userId },
      {
        agentId: run.agentId,
        environment: { artifact: '/definitely/missing/runner.mjs' },
        operationId: run.operationId,
        topicId: run.topicId,
      },
    );
    // Same proof: the personal contract (tenant `personal:<userId>`, no
    // member row required) admits, so verification — not the contract — fails.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('policy_denied');
    expect(result.error.message).toContain('manifest is not readable');
  });
});
