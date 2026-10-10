// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  chatGroups,
  chatGroupsAgents,
  projectAgents,
  projectMembers,
  projects,
  resourcePermissions,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectModel } from '@/database/models/project';

import { projectRouter } from '../project';

let db: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
// Transport authentication only; model scopes and config authority use actual rows.
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { trpc } = await import('@/libs/trpc/lambda/init');
  return { wsCompatProcedure: trpc.procedure };
});
const creator = 'project-config-creator';
const admin = 'project-config-admin';
const member = 'project-config-reader';
const viewer = 'project-config-viewer';
const workspaceId = 'project-config-workspace';
const projectId = 'project-config-project';
let agentId: string;
const actorIds = [creator, admin, member, viewer];
const caller = (userId: string) =>
  projectRouter.createCaller({ serverDB: db, userId, workspaceId } as never);
const linkedAgent = async (userId: string) =>
  (await caller(userId).detail({ id: projectId })).data.agents!.find(
    ({ agent }) => agent.id === agentId,
  )?.agent;
describe('Project detail linked Agent config authority', () => {
  beforeEach(async () => {
    db = await getTestDB();
    await db.insert(users).values(actorIds.map((id) => ({ id })));
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Config fixture',
      slug: workspaceId,
      primaryOwnerId: admin,
    });
    await db.insert(workspaceMembers).values(
      actorIds.map((userId) => ({
        userId,
        workspaceId,
        role: userId === admin ? 'admin' : userId === viewer ? 'viewer' : 'member',
      })),
    );
    const [agent] = await db
      .insert(agents)
      .values({
        userId: creator,
        workspaceId,
        visibility: 'public',
        virtual: true,
        title: 'Safe coordinator',
        description: 'Public profile',
        systemRole: 'SECRET_PROMPT',
        plugins: ['SECRET_PLUGIN'],
        params: { temperature: 0.7 },
        agencyConfig: { heterogeneousProvider: { type: 'codex', env: { TOKEN: 'SECRET_ENV' } } },
      })
      .returning();
    agentId = agent.id;
    await db.insert(projects).values({
      id: projectId,
      identifier: 'CONF',
      name: 'Shared',
      userId: creator,
      workspaceId,
      visibility: 'public',
      coordinatorAgentId: agentId,
    });
    await db
      .insert(projectAgents)
      .values({ projectId, agentId, workspaceId, addedByUserId: creator, role: 'coordinator' });
    await db
      .insert(projectMembers)
      .values({ projectId, workspaceId, userId: member, role: 'manager' });
  });
  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(inArray(users.id, actorIds));
    vi.restoreAllMocks();
  });
  it.each([member, viewer])(
    'returns a safe profile to %s without Agent Use or Manage',
    async (userId) => {
      const agent = await linkedAgent(userId);
      expect(agent).toMatchObject({
        id: agentId,
        title: 'Safe coordinator',
        description: 'Public profile',
      });
      expect(agent?.systemRole).toBeUndefined();
      expect(agent?.plugins).toBeUndefined();
      expect(agent?.params).toBeUndefined();
      expect(JSON.stringify(agent)).not.toContain('SECRET_');
      expect(await db.select().from(resourcePermissions)).toEqual([]);
    },
  );
  it('keeps Use-only Project managers on the safe profile and internal config readers intact', async () => {
    await db.insert(resourcePermissions).values({
      resourceType: 'agent',
      resourceId: agentId,
      workspaceId,
      userId: member,
      accessLevel: 'use',
      createdBy: creator,
    });
    expect(JSON.stringify(await linkedAgent(member))).not.toContain('SECRET_');
    expect(
      (await new ProjectModel(db, member, workspaceId).listAgents(projectId))?.[0].agent.systemRole,
    ).toBe('SECRET_PROMPT');
  });
  it.each([creator, admin])(
    'retains full configuration for legitimate Agent manager %s',
    async (userId) => {
      expect(await linkedAgent(userId)).toMatchObject({
        systemRole: 'SECRET_PROMPT',
        plugins: ['SECRET_PLUGIN'],
        params: { temperature: 0.7 },
        agencyConfig: { heterogeneousProvider: { env: { TOKEN: 'SECRET_ENV' } } },
      });
    },
  );
  it('applies Group and private ceilings to the linked virtual Agent', async () => {
    const [group] = await db
      .insert(chatGroups)
      .values({ userId: member, workspaceId, visibility: 'public', title: 'Parent' })
      .returning();
    await db
      .insert(chatGroupsAgents)
      .values({ userId: member, workspaceId, chatGroupId: group.id, agentId, role: 'participant' });
    await db.insert(resourcePermissions).values({
      resourceType: 'agentGroup',
      resourceId: group.id,
      workspaceId,
      accessLevel: 'view',
      createdBy: member,
    });
    expect(JSON.stringify(await linkedAgent(creator))).not.toContain('SECRET_');
    await db.update(chatGroups).set({ visibility: 'private' }).where(eq(chatGroups.id, group.id));
    expect(await linkedAgent(creator)).toBeUndefined();
    await db.delete(chatGroups).where(eq(chatGroups.id, group.id));
    await db
      .update(agents)
      .set({ visibility: 'private', description: 'UNPUBLISHED_PRIVATE' })
      .where(eq(agents.id, agentId));
    expect(await linkedAgent(member)).toBeUndefined();
    expect(await linkedAgent(admin)).toBeUndefined();
    expect(await linkedAgent(creator)).toMatchObject({ systemRole: 'SECRET_PROMPT' });
  });
});
