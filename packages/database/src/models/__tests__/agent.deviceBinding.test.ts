// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, devices, users, workspaces } from '../../schemas';
import { AgentModel } from '../agent';
import { DeviceModel } from '../device';
import { UserModel } from '../user';

const db = await getTestDB();
const userId = 'binding-invariant-owner';
const workspaceId = 'binding-invariant-workspace';
const agencyConfig = { boundDeviceId: 'binding-host', executionTarget: 'device' as const };

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: 'binding-other-owner' }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Binding invariant',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
  await db.insert(devices).values([
    { deviceId: 'binding-host', identitySource: 'installation', userId },
    {
      deviceId: 'binding-other-host',
      identitySource: 'installation',
      userId: 'binding-other-owner',
    },
    {
      deviceId: 'binding-shared-host',
      identitySource: 'installation',
      userId,
      workspaceId,
      visibility: 'public',
    },
    {
      deviceId: 'binding-retired-host',
      identitySource: 'installation',
      userId,
      retiredAt: new Date(),
    },
  ]);
});

afterEach(async () => {
  await db.delete(users);
});

describe('database Agent device binding', () => {
  it('blocks scope transfer without a destination host and supports an explicit authorized replacement', async () => {
    const [agent] = await db.insert(agents).values({ userId, agencyConfig }).returning();
    const model = new AgentModel(db, userId);
    await expect(
      model.transferAgent(agent.id, workspaceId, userId, 'public'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      (await db.select().from(agents).where(eq(agents.id, agent.id)))[0].workspaceId,
    ).toBeNull();
    await model.transferAgent(agent.id, workspaceId, userId, 'public', {
      targetDeviceId: 'binding-shared-host',
    });
    const [moved] = await db.select().from(agents).where(eq(agents.id, agent.id));
    expect(moved.workspaceId).toBe(workspaceId);
    expect(moved.agencyConfig?.boundDeviceId).toBe('binding-shared-host');
    expect(moved.boundDeviceRowId).not.toBe(agent.boundDeviceRowId);
  });

  it('preserves and retires a teammate referenced workspace host when its enroller account is deleted', async () => {
    const [host] = await db
      .insert(devices)
      .values({
        deviceId: 'departing-member-host',
        userId: 'binding-other-owner',
        workspaceId,
        visibility: 'public',
        identitySource: 'installation',
      })
      .returning();
    const [agent] = await db
      .insert(agents)
      .values({
        userId,
        workspaceId,
        agencyConfig: { ...agencyConfig, boundDeviceId: host.deviceId },
      })
      .returning();
    await UserModel.deleteUser(db, 'binding-other-owner');
    const [retained] = await db.select().from(devices).where(eq(devices.id, host.id));
    expect(retained).toMatchObject({ userId, workspaceId });
    expect(retained.retiredAt).not.toBeNull();
    expect(
      (await db.select().from(agents).where(eq(agents.id, agent.id)))[0]?.boundDeviceRowId,
    ).toBe(host.id);
    expect(
      await new DeviceModel(db, userId, workspaceId).findWorkspaceDeviceById(host.deviceId),
    ).toBeUndefined();
  });

  it.each([
    null,
    {},
    { boundDeviceId: '' },
    { boundDeviceId: 'missing', executionTarget: 'device' },
  ])('rejects direct Agent inserts without a real bound host: %j', async (config) => {
    await expect(
      db.execute(sql`
        INSERT INTO agents (id, user_id, agency_config, virtual)
        VALUES ('binding-invalid', ${userId}, ${JSON.stringify(config)}::jsonb, true)
      `),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    expect(await db.select().from(agents)).toHaveLength(0);
  });

  it('derives the real registry FK and refuses to clear or remove it', async () => {
    const [host] = await db.select().from(devices).where(eq(devices.deviceId, 'binding-host'));
    const [agent] = await db.insert(agents).values({ userId, agencyConfig }).returning();
    expect(agent.boundDeviceRowId).toBe(host.id);
    await expect(
      db.update(agents).set({ agencyConfig: null }).where(eq(agents.id, agent.id)),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(db.delete(devices).where(eq(devices.id, host.id))).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });

  it('does not trust a supplied registry FK or another user device', async () => {
    const [host] = await db.select().from(devices).where(eq(devices.deviceId, 'binding-host'));
    await expect(
      db.insert(agents).values({
        userId,
        boundDeviceRowId: host.id,
        agencyConfig: { ...agencyConfig, boundDeviceId: 'binding-other-host' },
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('requires public workspace Agents to bind public devices in that workspace', async () => {
    await expect(
      db.insert(agents).values({ userId, workspaceId, agencyConfig }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    const [agent] = await db
      .insert(agents)
      .values({
        userId,
        workspaceId,
        agencyConfig: { ...agencyConfig, boundDeviceId: 'binding-shared-host' },
      })
      .returning();
    expect(agent.boundDeviceRowId).toBeTruthy();
    await expect(
      db
        .update(devices)
        .set({ visibility: 'private' })
        .where(eq(devices.id, agent.boundDeviceRowId!)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('retains a retired registry identity without permitting new bindings', async () => {
    const [agent] = await db.insert(agents).values({ userId, agencyConfig }).returning();
    await db
      .update(devices)
      .set({ retiredAt: new Date() })
      .where(eq(devices.id, agent.boundDeviceRowId!));
    await db
      .update(agents)
      .set({ title: 'Existing historical binding' })
      .where(eq(agents.id, agent.id));
    await expect(db.insert(agents).values({ userId, agencyConfig })).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });
});
