import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaceUserSettingsService } from '@/services/workspaceUserSettings';

import { WorkspaceUserSettingsActionImpl } from './action';

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  getActiveWorkspaceId: () => 'workspace-1',
  useActiveWorkspaceId: () => 'workspace-1',
}));
vi.mock('@/libs/swr', () => ({ mutate: mockMutate, useClientDataSWR: vi.fn() }));
describe('workspace member mode preferences', () => {
  beforeEach(() => vi.clearAllMocks());
  it('preserves other Agent mode choices while updating one', async () => {
    const state = { workspaceUserPreference: { agentModeOverrides: { existing: true } } };
    const set = vi.fn((patch: any) => Object.assign(state, patch));
    const action = new WorkspaceUserSettingsActionImpl(set as never, () => state as never);
    vi.spyOn(workspaceUserSettingsService, 'updatePreference').mockResolvedValue();
    await action.updateWorkspaceUserPreference({ agentModeOverrides: { selected: false } });
    expect(state.workspaceUserPreference).toEqual({
      agentModeOverrides: { existing: true, selected: false },
    });
  });
});
