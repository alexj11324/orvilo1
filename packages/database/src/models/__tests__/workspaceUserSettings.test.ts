// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces, workspaceUserSettings } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { WorkspaceUserSettingsModel } from '../workspaceUserSettings';

const serverDB: OrviloDatabase = await getTestDB();

const workspaceId = 'ws-user-settings-test';
const userA = 'ws-us-user-a';
const userB = 'ws-us-user-b';

const cleanup = async () => {
  await serverDB.delete(workspaceUserSettings);
  await serverDB.delete(workspaces);
  await serverDB.delete(users);
};

beforeEach(async () => {
  await cleanup();
  await serverDB.insert(users).values([{ id: userA }, { id: userB }]);
  await serverDB
    .insert(workspaces)
    .values({ id: workspaceId, name: 'ws', primaryOwnerId: userA, slug: 'ws' });
});

afterEach(cleanup);

describe('WorkspaceUserSettingsModel', () => {
  it('returns undefined / empty defaults when no row exists yet', async () => {
    const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
    expect(await model.get()).toBeUndefined();
    expect(await model.getPreference()).toEqual({});
  });

  it('deep-merges agentModeOverrides so a single-agent patch never drops other agents', async () => {
    const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
    await model.updatePreference({ agentModeOverrides: { agentX: true } });

    await model.updatePreference({ agentModeOverrides: { agentY: false } });

    const preference = await model.getPreference();
    expect(preference.agentModeOverrides).toEqual({ agentX: true, agentY: false });
  });

  it('deep-merges sidebarAgentVisibilityOverrides across single-item patches', async () => {
    const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
    await model.updatePreference({ sidebarAgentVisibilityOverrides: { agentX: true } });

    await model.updatePreference({ sidebarAgentVisibilityOverrides: { agentY: false } });

    const preference = await model.getPreference();
    expect(preference.sidebarAgentVisibilityOverrides).toEqual({ agentX: true, agentY: false });
  });

  it.each([
    ['sidebarGroupAssignments', 'folder-1'],
    ['sidebarPinnedOverrides', true],
  ] as const)(
    'keeps deep-merging the deprecated %s for clients from before the shared sidebar',
    async (key, value) => {
      // The fields are deprecated but still on the API, so a released client
      // can patch a single item. A top-level replace would let one such write
      // shred the rest of that user's map — the very data the deprecation
      // promises to leave intact for a rollback.
      const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
      await model.updatePreference({ [key]: { itemX: value } } as any);

      await model.updatePreference({ [key]: { itemY: value } } as any);

      const preference = await model.getPreference();
      expect((preference as any)[key]).toEqual({ itemX: value, itemY: value });
    },
  );

  it('replaces sidebarHiddenGroupIds wholesale — the caller always writes the full list', async () => {
    const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
    await model.updatePreference({ sidebarHiddenGroupIds: ['folder-1', 'folder-2'] });

    // Un-hiding folder-1 sends the remaining list, not a delta.
    await model.updatePreference({ sidebarHiddenGroupIds: ['folder-2'] });

    const preference = await model.getPreference();
    expect(preference.sidebarHiddenGroupIds).toEqual(['folder-2']);
  });

  it('deep-merges notification so a single-switch patch never drops other toggles', async () => {
    const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
    await model.updatePreference({
      notification: {
        email: { items: { workspace: { workspace_member_joined: false } } },
        inbox: { enabled: false },
      },
    });

    // Patch a single other leaf — the earlier email item toggle and the inbox
    // master switch must both survive the write.
    await model.updatePreference({
      notification: {
        email: { items: { workspace: { workspace_payment_failed: false } } },
      },
    });

    const preference = await model.getPreference();
    expect(preference.notification).toEqual({
      email: {
        items: {
          workspace: { workspace_member_joined: false, workspace_payment_failed: false },
        },
      },
      inbox: { enabled: false },
    });
  });

  it('cascades on workspace delete — FK removes every row for that workspace', async () => {
    const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
    await model.updatePreference({
      agentDeviceOverrides: { a: { executionTarget: 'sandbox' } },
    });
    expect(await model.get()).toBeDefined();

    await serverDB.delete(workspaces);
    expect(await model.get()).toBeUndefined();
  });

  it('cascades on user delete — FK removes every row for that user', async () => {
    const model = new WorkspaceUserSettingsModel(serverDB, userA, workspaceId);
    await model.updatePreference({
      agentDeviceOverrides: { a: { executionTarget: 'sandbox' } },
    });
    expect(await model.get()).toBeDefined();

    await serverDB.delete(users);
    expect(await model.get()).toBeUndefined();
  });
});
