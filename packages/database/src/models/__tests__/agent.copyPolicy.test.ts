// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  agentsToSessions,
  devices,
  resourcePermissions,
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import { AgentModel } from '../agent';
import { ResourcePermissionModel } from '../resourcePermission';
import { SessionModel } from '../session';

const db = await getTestDB();
const owner = 'copy-policy-owner';
const member = 'copy-policy-member';
const workspaceId = 'copy-policy-workspace';
const agencyConfig = {
  executionTarget: 'device' as const,
  boundDeviceId: 'copy-policy-host',
  heterogeneousProvider: { type: 'codex' as const },
};

beforeAll(async () => {
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, slug: workspaceId, name: 'Copy policy', primaryOwnerId: owner });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: owner, role: 'owner' },
    { workspaceId, userId: member, role: 'member' },
  ]);
  await db.insert(devices).values({
    deviceId: agencyConfig.boundDeviceId,
    workspaceId,
    userId: owner,
    visibility: 'public',
    identitySource: 'fixture',
  });
});
afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
});

const rowCounts = async () => ({
  agents: (await db.select().from(agents)).length,
  sessions: (await db.select().from(sessions)).length,
  grants: (await db.select().from(resourcePermissions)).length,
});
const source = async () =>
  (
    await db
      .insert(agents)
      .values({
        workspaceId,
        userId: owner,
        visibility: 'public',
        title: 'Safe profile',
        systemRole: 'CONFIDENTIAL_COPY_FIXTURE',
        plugins: ['private-plugin'],
        agencyConfig,
      })
      .returning()
  )[0];

describe('Agent copy and public workspace boundaries', () => {
  it('requires source Manage even when the member has explicit Use', async () => {
    const original = await source();
    await new ResourcePermissionModel(db, workspaceId).upsertCollaborators({
      resourceType: 'agent',
      resourceId: original.id,
      userIds: [member],
      accessLevel: 'use',
      createdBy: owner,
    });
    const before = await rowCounts();
    await expect(
      new AgentModel(db, member, workspaceId).duplicate(original.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await rowCounts()).toEqual(before);
  });

  it('requires linked source Manage before cloning a member-owned Session', async () => {
    const original = await source();
    const [session] = await db
      .insert(sessions)
      .values({ workspaceId, userId: member, type: 'agent' })
      .returning();
    await db
      .insert(agentsToSessions)
      .values({ workspaceId, userId: member, agentId: original.id, sessionId: session.id });
    const before = await rowCounts();
    await expect(
      new SessionModel(db, member, workspaceId).duplicate(session.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await rowCounts()).toEqual(before);
  });

  it('keeps managed source cloning and its explicit creator Use', async () => {
    const original = await source();
    const copy = await new AgentModel(db, owner, workspaceId).duplicate(original.id);
    expect(copy).not.toBeNull();
    expect(
      (await new AgentModel(db, owner, workspaceId).getAgentConfigById(copy!.agentId))?.systemRole,
    ).toBe('CONFIDENTIAL_COPY_FIXTURE');
    expect(
      await new ResourcePermissionModel(db, workspaceId).getCollaboratorLevel(
        'agent',
        copy!.agentId,
        owner,
      ),
    ).toBe('use');
  });

  it('rejects explicit private Session creation with no Agent, Session or Use write', async () => {
    const before = await rowCounts();
    await expect(
      new SessionModel(db, member, workspaceId).create({
        type: 'agent',
        config: { visibility: 'private', systemRole: 'PRIVATE_DRAFT_FIXTURE', agencyConfig },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await rowCounts()).toEqual(before);
  });

  it('keeps omitted visibility Session creation public', async () => {
    const session = await new SessionModel(db, member, workspaceId).create({
      type: 'agent',
      config: { agencyConfig },
    });
    const [link] = await db
      .select()
      .from(agentsToSessions)
      .where(eq(agentsToSessions.sessionId, session.id));
    expect((await db.select().from(agents).where(eq(agents.id, link.agentId)))[0].visibility).toBe(
      'public',
    );
  });

  it('preserves personal private Session creation and cloning', async () => {
    await db.insert(devices).values({
      deviceId: 'copy-policy-personal-host',
      userId: member,
      visibility: 'private',
      identitySource: 'fixture',
    });
    const personal = new SessionModel(db, member);
    const session = await personal.create({
      type: 'agent',
      config: {
        visibility: 'private',
        systemRole: 'PERSONAL_PRIVATE_FIXTURE',
        agencyConfig: { ...agencyConfig, boundDeviceId: 'copy-policy-personal-host' },
      },
    });
    const copy = await personal.duplicate(session.id);
    expect(copy).toBeTruthy();
    const result = await personal.findByIdOrSlug(copy!.id);
    expect(result?.agent.visibility).toBe('private');
    expect(result?.agent.systemRole).toBe('PERSONAL_PRIVATE_FIXTURE');
  });

  it('preserves confirmed Use during managed single-record legacy publication', async () => {
    const original = await source();
    await db.update(agents).set({ visibility: 'private' }).where(eq(agents.id, original.id));
    await new ResourcePermissionModel(db, workspaceId).upsertCollaborators({
      resourceType: 'agent',
      resourceId: original.id,
      userIds: [member],
      accessLevel: 'use',
      createdBy: owner,
    });
    const before = await db.select().from(resourcePermissions);
    expect(
      (await new AgentModel(db, owner, workspaceId).setVisibility(original.id, 'public'))
        ?.visibility,
    ).toBe('public');
    expect(await db.select().from(resourcePermissions)).toEqual(before);
  });

  it('refuses workspace private visibility before changing config or confirmed Use', async () => {
    const original = await source();
    const permissions = new ResourcePermissionModel(db, workspaceId);
    await permissions.upsertCollaborators({
      resourceType: 'agent',
      resourceId: original.id,
      userIds: [member],
      accessLevel: 'use',
      createdBy: owner,
    });
    const before = await db.select().from(resourcePermissions);
    await expect(
      new AgentModel(db, owner, workspaceId).setVisibility(original.id, 'private'),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await db.select().from(agents).where(eq(agents.id, original.id)))[0].visibility).toBe(
      'public',
    );
    expect(await db.select().from(resourcePermissions)).toEqual(before);
  });
});
