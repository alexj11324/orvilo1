// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, devices, type NewAgent, users, workspaceMembers, workspaces } from '../../schemas';
import { AgentModel } from '../agent';

const db = await getTestDB();
const userId = 'agent-device-owner';
const otherUserId = 'other-device-owner';
const wsId = 'agent-device-workspace';
const ownHost = 'owner-laptop';
const otherHost = 'other-laptop';
const runtime = (config: Partial<NewAgent> = {}) => ({
  title: 'Saved runtime',
  ...config,
  agencyConfig: {
    executionTarget: 'device' as const,
    boundDeviceId: ownHost,
    heterogeneousProvider: { type: 'codex' as const, model: 'default' },
    ...config.agencyConfig,
  },
});
const model = new AgentModel(db, userId, wsId);
beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await db
    .insert(workspaces)
    .values({ id: wsId, name: 'Workspace', slug: 'binding-ws', primaryOwnerId: userId });
  await db.insert(workspaceMembers).values([
    { workspaceId: wsId, userId, role: 'owner' },
    { workspaceId: wsId, userId: otherUserId, role: 'member' },
  ]);
  await db.insert(devices).values([
    { deviceId: ownHost, userId, identitySource: 'machine-id' },
    { deviceId: otherHost, userId: otherUserId, identitySource: 'machine-id' },
  ]);
});
afterEach(async () => {
  await db.delete(users);
});

describe('Agent saved device ownership', () => {
  it.each(['private', 'public'] as const)(
    'creates a %s Agent inside the workspace on the actor’s own device',
    async (visibility) => {
      const created = await model.create(runtime({ visibility }));
      expect(created.workspaceId).toBe(wsId);
      expect(created.visibility).toBe(visibility);
      expect(created.agencyConfig?.boundDeviceId).toBe(ownHost);
    },
  );
  it('rejects binding another member’s device during creation', async () => {
    await expect(
      model.create(runtime({ agencyConfig: { boundDeviceId: otherHost } })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rejects adding another owner’s working directory binding', async () => {
    const created = await model.create(runtime());
    await expect(
      model.updateConfig(created.id, {
        agencyConfig: { workingDirByDevice: { [otherHost]: '/work' } },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rejects clearing the saved host and leaves it intact', async () => {
    const created = await model.create(runtime());
    await expect(
      model.updateConfig(created.id, { agencyConfig: { boundDeviceId: '' } }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const stored = await db.query.agents.findFirst({ where: eq(agents.id, created.id) });
    expect(stored?.agencyConfig?.boundDeviceId).toBe(ownHost);
  });
  it('allows an explicit switch to another device owned by the actor', async () => {
    await db
      .insert(devices)
      .values({ deviceId: 'owner-server', userId, identitySource: 'machine-id' });
    const created = await model.create(runtime());
    await model.updateConfig(created.id, { agencyConfig: { boundDeviceId: 'owner-server' } });
    const stored = await db.query.agents.findFirst({ where: eq(agents.id, created.id) });
    expect(stored?.agencyConfig?.boundDeviceId).toBe('owner-server');
  });
  it('preserves host and runtime when publishing and making the Agent private again', async () => {
    const created = await model.create(runtime({ visibility: 'private' }));
    await model.publishToWorkspace(created.id);
    await model.setVisibility(created.id, 'private');
    const stored = await db.query.agents.findFirst({ where: eq(agents.id, created.id) });
    expect(stored?.agencyConfig).toEqual(created.agencyConfig);
    expect(stored?.visibility).toBe('private');
  });
  it('duplicates the saved runtime on the same owner’s host', async () => {
    const created = await model.create(runtime());
    const copied = await model.duplicate(created.id);
    const stored = await db.query.agents.findFirst({ where: eq(agents.id, copied!.agentId) });
    expect(stored?.agencyConfig).toEqual(created.agencyConfig);
  });
  it('preserves the saved device when transferring into and out of a workspace', async () => {
    const personal = new AgentModel(db, userId);
    const created = await personal.create(
      runtime({ agencyConfig: { workingDirByDevice: { [ownHost]: '/work' } } }),
    );
    await personal.transferAgent(created.id, wsId, userId);
    await model.transferAgent(created.id, null, userId);
    const stored = await db.query.agents.findFirst({ where: eq(agents.id, created.id) });
    expect(stored?.workspaceId).toBeNull();
    expect(stored?.agencyConfig).toEqual(created.agencyConfig);
  });
});
