// @vitest-environment node
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, devices, users, workspaceMembers, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { DeviceModel } from '../device';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'device-model-test-user-id';
const otherUserId = 'device-model-other-user';
const wsId = 'device-model-ws-1';
const deviceModel = new DeviceModel(serverDB, userId);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
});

afterEach(async () => {
  await serverDB.delete(users).where(eq(users.id, userId));
  await serverDB.delete(devices).where(eq(devices.userId, userId));
});

describe('DeviceModel', () => {
  describe('register', () => {
    it('should insert a new device', async () => {
      const result = await deviceModel.register({
        deviceId: 'dev-1',
        hostname: 'My-Mac.local',
        identitySource: 'machine-id',
        platform: 'darwin',
      });

      expect(result.id).toBeDefined();
      expect(result).toMatchObject({
        deviceId: 'dev-1',
        hostname: 'My-Mac.local',
        identitySource: 'machine-id',
        platform: 'darwin',
        userId,
      });
    });

    it('should upsert on (userId, deviceId) and refresh machine fields', async () => {
      await deviceModel.register({
        deviceId: 'dev-1',
        hostname: 'old-host',
        identitySource: 'fallback',
        platform: 'linux',
      });

      await deviceModel.register({
        deviceId: 'dev-1',
        hostname: 'new-host',
        identitySource: 'machine-id',
        platform: 'darwin',
      });

      const rows = await serverDB.query.devices.findMany({
        where: and(eq(devices.userId, userId), eq(devices.deviceId, 'dev-1')),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        hostname: 'new-host',
        identitySource: 'machine-id',
        platform: 'darwin',
      });
    });

    it('should NOT overwrite user-owned fields on re-register', async () => {
      await deviceModel.register({
        deviceId: 'dev-1',
        hostname: 'host',
        identitySource: 'machine-id',
        platform: 'darwin',
      });
      await deviceModel.update('dev-1', {
        defaultCwd: '/Users/me/work',
        friendlyName: 'My Work Mac',
        workingDirs: [{ path: '/Users/me/work' }, { path: '/Users/me/tmp', repoType: 'github' }],
      });

      // Re-register (e.g. user logs in again / reconnects)
      await deviceModel.register({
        deviceId: 'dev-1',
        hostname: 'host',
        identitySource: 'machine-id',
        platform: 'darwin',
      });

      const row = await deviceModel.findByDeviceId('dev-1');
      expect(row).toMatchObject({
        defaultCwd: '/Users/me/work',
        friendlyName: 'My Work Mac',
        workingDirs: [{ path: '/Users/me/work' }, { path: '/Users/me/tmp', repoType: 'github' }],
      });
    });
  });

  describe('runtime installation evidence', () => {
    const codex = { available: true, command: 'codex', observedAt: '2026-10-06T21:00:00Z' };

    it('preserves runtime facts across capability updates and other runtime scans', async () => {
      await deviceModel.register({ deviceId: 'scanned', identitySource: 'machine-id' });
      await deviceModel.updateCapabilityEvidence('scanned', { supportedTools: ['files.read'] });
      await deviceModel.updateRuntimeInstallationEvidence('scanned', { codex });
      await deviceModel.updateCapabilityEvidence('scanned', { supportedTools: ['mcp.call'] });
      await deviceModel.updateRuntimeInstallationEvidence('scanned', {
        'claude-code': { ...codex, command: 'claude', available: false },
      });
      expect((await deviceModel.findByDeviceId('scanned'))?.capabilitySnapshot).toEqual({
        supportedTools: ['mcp.call'],
        installedRuntimes: {
          codex,
          'claude-code': { ...codex, command: 'claude', available: false },
        },
      });
    });

    it('never updates another user’s personal installation facts', async () => {
      const other = new DeviceModel(serverDB, otherUserId);
      await other.register({ deviceId: 'shared-id', identitySource: 'machine-id' });
      await deviceModel.updateRuntimeInstallationEvidence('shared-id', { codex });
      expect((await other.findByDeviceId('shared-id'))?.capabilitySnapshot).toBeNull();
    });
  });

  describe('query', () => {
    it('should return only the current user devices, newest lastSeen first', async () => {
      await deviceModel.register({ deviceId: 'dev-old', identitySource: 'machine-id' });
      await deviceModel.register({ deviceId: 'dev-new', identitySource: 'machine-id' });
      // The in-memory test DB may assign both inserts the same millisecond.
      // Pin distinct timestamps so this ordering assertion is deterministic.
      await serverDB
        .update(devices)
        .set({ lastSeenAt: new Date('2026-01-01T00:00:00.000Z') })
        .where(eq(devices.deviceId, 'dev-old'));
      await serverDB
        .update(devices)
        .set({ lastSeenAt: new Date('2026-01-02T00:00:00.000Z') })
        .where(eq(devices.deviceId, 'dev-new'));
      // a device owned by another user must not leak
      await new DeviceModel(serverDB, 'device-model-other-user').register({
        deviceId: 'other-dev',
        identitySource: 'machine-id',
      });

      const list = await deviceModel.query();
      expect(list.map((d) => d.deviceId)).toEqual(['dev-new', 'dev-old']);
    });
  });

  describe('update', () => {
    it('should update user-editable fields', async () => {
      await deviceModel.register({ deviceId: 'dev-1', identitySource: 'machine-id' });

      await deviceModel.update('dev-1', { friendlyName: 'Renamed' });

      const row = await deviceModel.findByDeviceId('dev-1');
      expect(row?.friendlyName).toBe('Renamed');
    });
  });

  describe('delete', () => {
    it('should remove the row', async () => {
      await deviceModel.register({ deviceId: 'dev-1', identitySource: 'machine-id' });

      await deviceModel.delete('dev-1');

      const row = await deviceModel.findByDeviceId('dev-1');
      expect(row).toBeUndefined();
    });
  });
});

describe('execution through a saved Agent host', () => {
  const setup = async (visibility: 'private' | 'public') => {
    await serverDB
      .insert(workspaces)
      .values({ id: wsId, name: 'Team', slug: wsId, primaryOwnerId: userId });
    await serverDB.insert(workspaceMembers).values([
      { userId, workspaceId: wsId, role: 'owner' },
      { userId: otherUserId, workspaceId: wsId, role: 'member' },
    ]);
    await deviceModel.register({
      deviceId: 'saved-host',
      hostname: 'Owner Mac',
      identitySource: 'machine-id',
    });
    await deviceModel.register({ deviceId: 'unbound-host', identitySource: 'machine-id' });
    await serverDB.insert(agents).values({
      id: 'agt-device-bound',
      userId,
      workspaceId: wsId,
      visibility,
      model: 'default',
      provider: 'codex',
      agencyConfig: {
        boundDeviceId: 'saved-host',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'codex', model: 'default' },
      },
    });
  };
  it('resolves the saved workspace Agent host for another member without a device sharing step', async () => {
    await setup('public');
    const member = new DeviceModel(serverDB, otherUserId, wsId);
    expect(await member.query()).toEqual([]);
    expect((await member.findExecutionDeviceById('saved-host'))?.userId).toBe(userId);
    expect(await member.findExecutionDeviceById('unbound-host')).toBeUndefined();
    await member.update('saved-host', { friendlyName: 'hijacked' });
    expect((await deviceModel.findByDeviceId('saved-host'))?.friendlyName).toBeNull();
  });
  it('does not expose a private Agent host to another member', async () => {
    await setup('private');
    expect(
      await new DeviceModel(serverDB, otherUserId, wsId).findExecutionDeviceById('saved-host'),
    ).toBeUndefined();
  });
  it('revokes execution when the host owner leaves, preserving their device registration', async () => {
    await setup('public');
    await serverDB
      .update(workspaceMembers)
      .set({ deletedAt: new Date() })
      .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)));
    expect(
      await new DeviceModel(serverDB, otherUserId, wsId).findExecutionDeviceById('saved-host'),
    ).toBeUndefined();
    expect(await deviceModel.findByDeviceId('saved-host')).toBeDefined();
  });
  it('rejects an explicit device ID collision from another account', async () => {
    await deviceModel.register({ deviceId: 'same-physical-id', identitySource: 'fallback' });
    await expect(
      new DeviceModel(serverDB, otherUserId).register({
        deviceId: 'same-physical-id',
        identitySource: 'fallback',
      }),
    ).rejects.toThrow();
  });
});
