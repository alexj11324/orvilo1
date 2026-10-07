// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  devices,
  projectMembers,
  projects,
  resourcePermissions,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceUserSettingsModel } from '@/database/models/workspaceUserSettings';

import { projectRouter } from '../project';

let db: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn(() => db) }));

const owner = 'project-privacy-rpc-owner';
const member = 'project-privacy-rpc-member';
const workspaceId = 'project-privacy-rpc-workspace';
const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, member));
  await db.delete(users).where(eq(users.id, owner));
};

beforeEach(async () => {
  db = await getTestDB();
  await cleanup();
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Creation privacy',
    slug: workspaceId,
    primaryOwnerId: owner,
  });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: owner, role: 'owner' },
    { workspaceId, userId: member, role: 'member' },
  ]);
  await db.insert(devices).values({
    deviceId: 'project-privacy-rpc-host',
    identitySource: 'fallback',
    userId: member,
    workspaceId,
    visibility: 'public',
  });
  await db.insert(agents).values({
    id: 'project-privacy-rpc-source',
    userId: member,
    workspaceId,
    visibility: 'public',
    agencyConfig: {
      boundDeviceId: 'project-privacy-rpc-host',
      executionTarget: 'device',
      heterogeneousProvider: { type: 'codex' },
    },
  });
  await new WorkspaceUserSettingsModel(db, member, workspaceId).updatePreference({
    orchestratorAgentId: 'project-privacy-rpc-source',
  });
});
afterEach(cleanup);

describe('Project create privacy boundary', () => {
  it('rejects explicit private input with BAD_REQUEST and no resource/grant inserts', async () => {
    const before = [
      await db.select().from(projects),
      await db.select().from(agents),
      await db.select().from(projectMembers),
      await db.select().from(resourcePermissions),
    ];
    const caller = projectRouter.createCaller({
      userId: member,
      jwtPayload: { userId: member },
      workspaceId,
    });
    await expect(
      caller.create({ identifier: 'PRIV', name: 'Explicit private', visibility: 'private' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'New workspace Projects must be public',
    });
    expect([
      await db.select().from(projects),
      await db.select().from(agents),
      await db.select().from(projectMembers),
      await db.select().from(resourcePermissions),
    ]).toEqual(before);
  });

  it.each([undefined, 'public'] as const)(
    'creates public resources for %s visibility input',
    async (visibility) => {
      const caller = projectRouter.createCaller({
        userId: member,
        jwtPayload: { userId: member },
        workspaceId,
      });
      const response = await caller.create({
        identifier: 'PUB',
        name: 'Public workspace Project',
        visibility,
      });
      expect(response.data).toMatchObject({ workspaceId, visibility: 'public' });
      const [creator] = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, response.data.id));
      expect(creator).toMatchObject({ userId: member, role: 'manager' });
    },
  );
});
