import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaceUserSettingsService } from '@/services/workspaceUserSettings';

import { WorkspaceUserSettingsActionImpl } from './action';

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  getActiveWorkspaceId: () => 'workspace-1',
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/libs/swr', () => ({
  mutate: mockMutate,
  useClientDataSWR: vi.fn(),
}));

describe('WorkspaceUserSettingsActionImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically deep-merges one Agent mode without dropping other modes', async () => {
    const state = {
      workspaceUserPreference: {
        agentModeOverrides: { existing: true },
      },
    };
    const set = vi.fn((patch: Partial<typeof state>) => Object.assign(state, patch));
    const action = new WorkspaceUserSettingsActionImpl(set as never, () => state as never);
    vi.spyOn(workspaceUserSettingsService, 'updatePreference').mockResolvedValue();

    await action.updateWorkspaceUserPreference({
      agentModeOverrides: { selected: false },
    });

    expect(state.workspaceUserPreference.agentModeOverrides).toEqual({
      existing: true,
      selected: false,
    });
  });

  it('optimistically deep-merges sidebar visibility without dropping other items', async () => {
    const state = {
      workspaceUserPreference: {
        sidebarAgentVisibilityOverrides: { existing: true },
      },
    };
    const set = vi.fn((patch: Partial<typeof state>) => Object.assign(state, patch));
    const action = new WorkspaceUserSettingsActionImpl(set as never, () => state as never);
    vi.spyOn(workspaceUserSettingsService, 'updatePreference').mockResolvedValue();

    await action.updateWorkspaceUserPreference({
      sidebarAgentVisibilityOverrides: { selected: false },
    });

    expect(state.workspaceUserPreference.sidebarAgentVisibilityOverrides).toEqual({
      existing: true,
      selected: false,
    });
  });

  it('optimistically deep-merges one notification switch without dropping sibling toggles', async () => {
    const state = {
      workspaceUserPreference: {
        notification: {
          email: { items: { workspace: { workspace_member_joined: false } } },
          inbox: { enabled: false },
        },
      },
    };
    const set = vi.fn((patch: Partial<typeof state>) => Object.assign(state, patch));
    const action = new WorkspaceUserSettingsActionImpl(set as never, () => state as never);
    vi.spyOn(workspaceUserSettingsService, 'updatePreference').mockResolvedValue();

    // Patch a single other leaf — the earlier email item toggle and the inbox
    // master switch must both survive in the optimistic cache, mirroring what
    // the server-side deep merge keeps in the DB.
    await action.updateWorkspaceUserPreference({
      notification: {
        email: { items: { workspace: { workspace_payment_failed: false } } },
      },
    });

    expect(state.workspaceUserPreference.notification).toEqual({
      email: {
        items: {
          workspace: { workspace_member_joined: false, workspace_payment_failed: false },
        },
      },
      inbox: { enabled: false },
    });
  });
});
