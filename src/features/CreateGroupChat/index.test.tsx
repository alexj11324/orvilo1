import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentGroupStore } from '@/store/agentGroup/store';
import { useGlobalStore } from '@/store/global';

import { CreateGroupChatContent } from '.';

const mocks = vi.hoisted(() => ({ close: vi.fn(), finishSetup: vi.fn(), copyDirectory: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/business/client/hooks/useHasActiveWorkspace', () => ({
  useHasActiveWorkspace: () => false,
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  getActiveWorkspaceSlug: () => 'team',
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/components/Modal', () => ({
  createModal: vi.fn(),
  ModalFooter: ({ children }: { children: ReactNode }) => children,
  useModalContext: () => ({ close: mocks.close }),
}));
vi.mock('@/services/agent', () => ({
  agentService: {
    queryAgents: vi.fn().mockResolvedValue([
      {
        id: 'existing-member',
        name: 'Existing member',
        title: 'Agent',
        heterogeneousType: 'codex',
      },
    ]),
  },
}));
vi.mock('./useGroupChatCreation', () => ({
  useGroupChatCreation: () => ({ create: mocks.finishSetup, pending: false }),
}));
vi.mock('@/features/Orchestrator/useOrchestratorPreference', () => ({
  useOrchestratorPreference: () => ({ agentId: 'configured-orchestrator', loading: false }),
}));
vi.mock('@/features/Orchestrator/copyWorkingDirectory', () => ({
  copyOrchestratorWorkingDirectory: mocks.copyDirectory,
}));
vi.mock('@/features/Orchestrator/ConfiguredOrchestratorSelector', () => ({
  default: ({
    onSelect,
  }: {
    onSelect: (id: string, runtime: { agencyConfig: object }) => void;
  }) => (
    <button
      onClick={() =>
        onSelect('configured-orchestrator', {
          agencyConfig: { executionTarget: 'local', heterogeneousProvider: { type: 'opencode' } },
        })
      }
    >
      Choose configured orchestrator
    </button>
  ),
}));

describe('global group creation modal navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.finishSetup.mockResolvedValue('group-created');
    mocks.copyDirectory.mockResolvedValue(undefined);
  });

  it('opens the created group in the active tab while the modal belongs to the frozen root router', async () => {
    // Imperative ModalHost renders in the outer shell, not the active tab's router.
    const root = createMemoryRouter([{ path: '*', element: <CreateGroupChatContent /> }], {
      initialEntries: ['/team/group/group-old/topic-old'],
    });
    const activeTab = createMemoryRouter([{ path: '*', element: null }], {
      initialEntries: ['/team/group/group-old/topic-old'],
    });
    const previousNavigation = useGlobalStore.getState().navigationRef;
    useGlobalStore.setState({ navigationRef: { current: activeTab.navigate } });
    useAgentGroupStore.setState({ groupMap: {} });
    const view = render(<RouterProvider router={root} />);
    try {
      fireEvent.change(screen.getByLabelText('group.create.name'), {
        target: { value: 'Native Group' },
      });
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'Existing member' })).toBeTruthy(),
      );
      fireEvent.click(screen.getByRole('checkbox', { name: 'Existing member' }));
      fireEvent.click(screen.getByRole('button', { name: 'group.settings.setCoordinator' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'group.create.submit' })).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'group.create.submit' }));
      await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(1));
      expect(root.state.location.pathname).toBe('/team/group/group-old/topic-old');
      expect(activeTab.state.location.pathname).toBe('/team/group/group-created');
      expect(mocks.finishSetup).toHaveBeenCalledTimes(1);
      expect(mocks.finishSetup).toHaveBeenCalledWith(
        expect.objectContaining({ coordinatorAgentId: 'existing-member' }),
        ['existing-member'],
      );
      expect(mocks.copyDirectory).not.toHaveBeenCalled();
      expect(mocks.close).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      useGlobalStore.setState({ navigationRef: previousNavigation });
      root.dispose();
      activeTab.dispose();
    }
  });
});
