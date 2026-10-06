import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { CoordinatorSummary } from './CoordinatorSummary';
import { GroupProfile } from './index';

const sourceB = vi.hoisted(() =>
  Object.freeze({
    id: 'source-b',
    title: 'Original source B',
    model: 'codex-model-b',
    agencyConfig: Object.freeze({
      executionTarget: 'local' as const,
      heterogeneousProvider: Object.freeze({ type: 'codex' as const, model: 'codex-model-b' }),
    }),
  }),
);
const api = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue(undefined),
  refresh: vi
    .fn()
    .mockRejectedValueOnce(new Error('detail refresh failed'))
    .mockResolvedValue(undefined),
  copyDirectory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router', () => ({ useParams: () => ({ gid: 'group-one' }) }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/features/ResourcePermission/ResourceConfigAccessGate', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/Skeleton/Profile', () => ({ default: () => null }));
vi.mock('@/components/Modal', () => ({ confirmModal: vi.fn() }));
vi.mock('@/components/toast', () => ({ toast: { success: vi.fn() } }));
vi.mock('@/components/AsyncError', () => ({
  default: ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
    <div role="alert">
      {error.message}
      <button onClick={onRetry}>Retry save</button>
    </div>
  ),
}));
vi.mock('@/routes/(main)/group/profile/StoreSync', () => ({ default: () => null }));
vi.mock('@/routes/(main)/group/profile/features/GroupProfile', () => ({ default: () => null }));
vi.mock('@/routes/(main)/group/profile/features/MemberProfile', () => ({ default: () => null }));
vi.mock('@/routes/(main)/group/_layout/Sidebar/AddGroupMemberModal', () => ({
  default: () => null,
}));
vi.mock('@/store/groupProfile', () => ({ useGroupProfileStore: { setState: vi.fn() } }));
vi.mock('@/services/agent', () => ({ agentService: { updateAgentConfig: api.update } }));
vi.mock('@/features/Orchestrator/copyWorkingDirectory', () => ({
  copyOrchestratorWorkingDirectory: api.copyDirectory,
}));
vi.mock('swr', () => ({ default: () => ({ data: [], isLoading: false }) }));
vi.mock('@/services/device', () => ({ deviceService: { listDevices: vi.fn() } }));
vi.mock('@/features/CreateAgent/agentOptions', () => ({
  modelDisplayLabel: ({ id }: { id: string }) => id,
}));
vi.mock('@/features/Orchestrator/ConfiguredOrchestratorSelector', () => ({
  default: ({
    value,
    onSelect,
  }: {
    value?: string;
    onSelect: (id: string, runtime: typeof sourceB, explicit: boolean) => void;
  }) => (
    <div>
      <output aria-label="Selected source">{value}</output>
      <button onClick={() => onSelect(sourceB.id, sourceB, true)}>Choose source B</button>
    </div>
  ),
}));
vi.mock('@/store/agentGroup/selectors', () => ({
  agentGroupSelectors: {
    getGroupById: (id: string) => (state: { groups: Record<string, unknown> }) => state.groups[id],
  },
}));
vi.mock('@/store/agentGroup', () => {
  // The update commits remotely, but the rejected refresh leaves the old A snapshot here.
  const state = {
    groups: {
      'group-one': {
        id: 'group-one',
        title: 'Group',
        visibility: 'private',
        workspaceId: 'workspace-one',
        agents: [
          {
            id: 'owned-coordinator',
            isSupervisor: true,
            model: 'old-model-a',
            params: { orchestratorSourceAgentId: 'source-a' },
            systemRole: 'Old instructions',
            agencyConfig: { executionTarget: 'local', heterogeneousProvider: { type: 'codex' } },
          },
        ],
      },
    },
    refreshGroupDetail: api.refresh,
  };
  return {
    useAgentGroupStore: Object.assign((select: (value: typeof state) => unknown) => select(state), {
      getState: () => state,
    }),
  };
});

it('retains source B after a failed refresh and retries prompt saving without copying its directory again', async () => {
  const originalSource = JSON.stringify(sourceB);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<GroupProfile />);
    fireEvent.click(screen.getByRole('tab', { name: 'group.settings.tabs.coordinator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose source B' }));
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('detail refresh failed'),
    );
    expect(screen.getByLabelText('Selected source').textContent).toBe('source-b');
    expect(api.copyDirectory).toHaveBeenCalledOnce();
    expect(api.copyDirectory).toHaveBeenCalledWith('source-b', 'owned-coordinator');

    fireEvent.change(screen.getByLabelText('group.settings.coordinationInstructions'), {
      target: { value: 'Updated instructions only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(2));
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.update).toHaveBeenLastCalledWith(
      'owned-coordinator',
      expect.objectContaining({
        params: { orchestratorSourceAgentId: 'source-b' },
        systemRole: 'Updated instructions only',
        model: 'codex-model-b',
      }),
    );
    expect(api.update.mock.calls.every(([id]) => id === 'owned-coordinator')).toBe(true);
    expect(api.copyDirectory).toHaveBeenCalledOnce();
    expect(JSON.stringify(sourceB)).toBe(originalSource);
  } finally {
    consoleError.mockRestore();
  }
});

it('shows the selected Agent and actual OpenCode engine in the shared summary', () => {
  render(
    <CoordinatorSummary
      config={{
        title: 'Journey Agent',
        model: 'stale-api-model',
        agencyConfig: {
          executionTarget: 'local',
          heterogeneousProvider: { type: 'opencode', model: 'mimo-v2-pro' },
        },
      }}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Journey Agent' })).toBeTruthy();
  expect(screen.getByText('group.settings.engine: OpenCode')).toBeTruthy();
  expect(screen.getByText('group.settings.model: mimo-v2-pro')).toBeTruthy();
  expect(screen.queryByText(/Prime|stale-api-model/)).toBeNull();
});
