// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  agentsToSessions,
  chatGroups,
  chatGroupsAgents,
  resourcePermissions,
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentModel } from '@/database/models/agent';

import { agentRouter } from '../agent';
import { sessionRouter } from '../session';

let db: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
// Authenticate at the transport seam; models and Agent config authorization use real rows.
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { trpc } = await import('@/libs/trpc/lambda/init');
  return { wsCompatProcedure: trpc.procedure };
});

const ownerId = 'session-permission-owner';
const memberId = 'session-permission-member';
const workspaceId = 'session-permission-workspace';

describe('Session RPC Agent config protection', () => {
  beforeEach(async () => {
    db = await getTestDB();
    await db.insert(users).values([{ id: ownerId }, { id: memberId }]);
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Permission fixture',
      slug: workspaceId,
      primaryOwnerId: ownerId,
    });
    await db.insert(workspaceMembers).values([
      { userId: ownerId, workspaceId, role: 'owner' },
      { userId: memberId, workspaceId, role: 'member' },
    ]);
    const [agent] = await db
      .insert(agents)
      .values({
        userId: ownerId,
        workspaceId,
        visibility: 'public',
        title: 'Safe Agent title',
        systemRole: 'CONFIDENTIAL_SYSTEM_PROMPT',
        plugins: ['private-tool'],
        agencyConfig: { heterogeneousProvider: { type: 'codex', env: { TOKEN: 'fixture-key' } } },
      })
      .returning();
    const [group] = await db
      .insert(chatGroups)
      .values({ userId: ownerId, workspaceId, visibility: 'public', title: 'Safe group' })
      .returning();
    await db.insert(chatGroupsAgents).values({
      userId: ownerId,
      workspaceId,
      chatGroupId: group.id,
      agentId: agent.id,
      role: 'participant',
    });
    const [session] = await db
      .insert(sessions)
      .values({ userId: memberId, workspaceId, type: 'agent', title: 'My conversation' })
      .returning();
    await db
      .insert(agentsToSessions)
      .values({ userId: memberId, workspaceId, agentId: agent.id, sessionId: session.id });
  });
  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, ownerId));
    await db.delete(users).where(eq(users.id, memberId));
  });
  const caller = () =>
    sessionRouter.createCaller({ serverDB: db, userId: memberId, workspaceId } as never);

  it.each(['new Viewer', 'creator downgraded to Viewer'] as const)(
    'bootstraps Inbox through the real read RPC for %s without mutable defaults or Use',
    async (state) => {
      if (state === 'creator downgraded to Viewer') {
        const builtin = await new AgentModel(db, memberId, workspaceId).getBuiltinAgent('inbox');
        await db
          .update(agents)
          .set({ systemRole: 'KEEP_ORIGINAL_INBOX' })
          .where(eq(agents.id, builtin!.id));
        // Revoked Use must remain revoked when this creator later becomes Viewer.
        await db.delete(resourcePermissions).where(eq(resourcePermissions.userId, memberId));
      }
      await db
        .update(workspaceMembers)
        .set({ role: 'viewer' })
        .where(eq(workspaceMembers.userId, memberId));
      const reader = agentRouter.createCaller({
        serverDB: db,
        userId: memberId,
        workspaceId,
      } as never);
      const result = await reader.getAgentConfig({ sessionId: 'inbox' });
      expect(result?.id).toBeTruthy();
      expect(result?.systemRole).toBeUndefined();
      const [builtin] = await db.select().from(agents).where(eq(agents.slug, 'inbox'));
      expect(builtin.userId).toBe(memberId);
      if (state === 'creator downgraded to Viewer')
        expect(builtin.systemRole).toBe('KEEP_ORIGINAL_INBOX');
      expect(
        await db.select().from(resourcePermissions).where(eq(resourcePermissions.userId, memberId)),
      ).toEqual([]);
      expect(await reader.getAgentConfig({ sessionId: 'inbox' })).toEqual(result);
    },
  );
  it.each(['getSessions', 'getGroupedSessions'] as const)(
    'redacts full Agent config from %s for an active Member session',
    async (method) => {
      const result =
        method === 'getSessions'
          ? await caller().getSessions({})
          : await caller().getGroupedSessions();
      expect(JSON.stringify(result)).toContain('Safe Agent title');
      expect(JSON.stringify(result)).not.toContain('CONFIDENTIAL_SYSTEM_PROMPT');
      expect(JSON.stringify(result)).not.toContain('private-tool');
      expect(JSON.stringify(result)).not.toContain('fixture-key');
    },
  );
});
