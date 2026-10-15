// @vitest-environment node
import { agentOperations, agents, workspaces } from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

import {
  cleanupTestUser,
  createTestUser,
} from '@/server/routers/lambda/__tests__/integration/setup';

import {
  snapshotWorkspaceAgentOperations,
  stopRevokedCallerOperations,
  stopWorkspaceAgentOperations,
} from './revocation';

const { interrupt, principals } = vi.hoisted(() => ({
  interrupt: vi.fn().mockResolvedValue({ cancelState: 'requested', success: true }),
  principals: [] as string[],
}));
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn(function (_db, userId) {
    principals.push(userId);
    return { interruptTask: interrupt };
  }),
}));

const db = await getTestDB();

it('revocation stops only this caller and Agent, including pending native questions', async () => {
  const caller = await createTestUser(db);
  const hostOwner = await createTestUser(db);
  const workspaceId = `revocation-${caller}`;
  try {
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: workspaceId,
      name: 'Revocation',
      primaryOwnerId: hostOwner,
    });
    await db.insert(agents).values([
      { id: 'revoked-agent', userId: hostOwner, workspaceId },
      { id: 'other-agent', userId: hostOwner, workspaceId },
    ]);
    await db.insert(agentOperations).values([
      {
        id: 'caller-running',
        userId: caller,
        agentId: 'revoked-agent',
        workspaceId,
        status: 'running',
      },
      {
        id: 'caller-question',
        userId: caller,
        agentId: 'revoked-agent',
        workspaceId,
        status: 'waiting_for_human',
      },
      {
        id: 'host-running',
        userId: hostOwner,
        agentId: 'revoked-agent',
        workspaceId,
        status: 'running',
      },
      {
        id: 'caller-other-agent',
        userId: caller,
        agentId: 'other-agent',
        workspaceId,
        status: 'running',
      },
      {
        id: 'caller-finished',
        userId: caller,
        agentId: 'revoked-agent',
        workspaceId,
        status: 'done',
      },
    ]);
    await stopRevokedCallerOperations(db, {
      agentId: 'revoked-agent',
      userId: caller,
      workspaceId,
    });
    expect(interrupt.mock.calls.map(([input]) => input.operationId).sort()).toEqual([
      'caller-question',
      'caller-running',
    ]);
    expect(principals).toEqual([caller]);
    const rows = await db
      .select()
      .from(agentOperations)
      .where(eq(agentOperations.workspaceId, workspaceId));
    expect(rows.find(({ id }) => id === 'caller-running')?.status).toBe('running');
    expect(rows.find(({ id }) => id === 'host-running')?.status).toBe('running');
    // Orphan Agent deletion clears foreign keys; the pre-delete snapshot keeps
    // this exact set of callers addressable without stopping their other Agent.
    const scope = { agentId: 'revoked-agent', workspaceId };
    const snapshot = await snapshotWorkspaceAgentOperations(db, scope);
    await db.delete(agents).where(eq(agents.id, scope.agentId));
    interrupt.mockClear();
    await stopWorkspaceAgentOperations(db, scope, snapshot);
    expect(interrupt.mock.calls.map(([input]) => input.operationId).sort()).toEqual([
      'caller-question',
      'caller-running',
      'host-running',
    ]);
  } finally {
    await db.delete(agentOperations).where(eq(agentOperations.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await cleanupTestUser(db, caller);
    await cleanupTestUser(db, hostOwner);
  }
});
