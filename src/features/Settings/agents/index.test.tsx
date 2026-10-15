/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AgentsSettings from './index';

interface WorkspaceSnapshot {
  data: Array<{ id: string; role: string }> | undefined;
  error: Error | undefined;
  isLoading: boolean;
  workspaceId: string | null;
}

interface AgentModalOptions {
  onCreated: (agentId: string, config: { name?: string; title?: string }) => Promise<void>;
  visibility?: string;
}

const offline = vi.hoisted(() => {
  let snapshot: WorkspaceSnapshot = {
    data: [{ id: 'workspace', role: 'viewer' }],
    error: undefined,
    isLoading: false,
    workspaceId: 'workspace',
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    navigate: vi.fn(),
    openConnectAgentModal: vi.fn<(options: AgentModalOptions) => void>(),
    openNewConversation: vi.fn(),
    publish: (next: WorkspaceSnapshot) => {
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
    refreshAgentList: vi.fn<() => Promise<void>>(),
    removeAgent: vi.fn(),
    retry: vi.fn(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toastSuccess: vi.fn(),
  };
});

// Only the offline query/store and side-effect boundaries are replaced.
// The permission matrix, permission hook, creation hook and local Button stay real.
vi.mock('@/business/client/hooks/useActiveWorkspaceId', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useActiveWorkspaceId: () =>
      useSyncExternalStore(offline.subscribe, offline.getSnapshot, offline.getSnapshot).workspaceId,
  };
});
vi.mock('@/business/client/hooks/useFetchWorkspaces', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useFetchWorkspaces: () =>
      useSyncExternalStore(offline.subscribe, offline.getSnapshot, offline.getSnapshot),
  };
});
vi.mock('@/store/home', () => ({
  useHomeStore: (
    selector: (state: {
      refreshAgentList: typeof offline.refreshAgentList;
      removeAgent: typeof offline.removeAgent;
    }) => unknown,
  ) =>
    selector({
      refreshAgentList: offline.refreshAgentList,
      removeAgent: offline.removeAgent,
    }),
}));
// Keep the real callable leaf; avoid loading unrelated exports in the barrel.
vi.mock('@/features/HomeSidebar/hooks', async () => ({
  useCreateMenuItems: (await import('@/features/HomeSidebar/hooks/useCreateMenuItems'))
    .useCreateMenuItems,
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => offline.navigate,
}));
vi.mock('@/features/ConnectAgent', () => ({
  openConnectAgentModal: offline.openConnectAgentModal,
}));
vi.mock('@/features/Conversation/selectAgent', () => ({
  openNewConversation: offline.openNewConversation,
}));
vi.mock('@/components/toast', () => ({ toast: { success: offline.toastSuccess } }));
vi.mock('@/hooks/useFetchAgentList', () => ({
  useFetchAgentList: () => ({ error: undefined, mutate: offline.retry }),
}));

// Layout and unrelated settings children are outside this action regression.
// They do not supply or reinterpret the real Button/permission/create outcome.
vi.mock('@/features/Setting/SettingContainer', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/AgentOnboarding', () => ({ AgentSetupPrompt: () => null }));
vi.mock('@/features/DefaultAgent/DefaultAgentSetting', () => ({ default: () => null }));
vi.mock('./AgentSettingsList', () => ({ AgentSettingsList: () => null }));
vi.mock('./AgentSettingsDetailPage', () => ({ default: () => null }));
vi.mock('@/store/agent', () => ({
  useAgentStore: Object.assign(
    (selector: (state: { useFetchAgentConfig: () => void }) => unknown) =>
      selector({ useFetchAgentConfig: vi.fn() }),
    { getState: () => ({ activeAgentId: undefined }), setState: vi.fn() },
  ),
}));
vi.mock('@/store/chat', () => ({
  useChatStore: { getState: () => ({ activeAgentId: undefined }), setState: vi.fn() },
}));
vi.mock('@/store/user', () => ({ useUserStore: () => false }));
vi.mock('@/store/user/selectors', () => ({ authSelectors: { isLogin: () => false } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function publishRole(role: string | null, patch: Partial<WorkspaceSnapshot> = {}) {
  offline.publish({
    data: role ? [{ id: 'workspace', role }] : undefined,
    error: undefined,
    isLoading: false,
    workspaceId: 'workspace',
    ...patch,
  });
}

function mountSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings/agents']}>
      <Routes>
        <Route element={<AgentsSettings />} path="/settings/:tab" />
      </Routes>
    </MemoryRouter>,
  );
}

function newAgentButton() {
  return screen.getByRole('button', { name: 'newAgent' });
}

describe('Settings Agent creation authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    offline.refreshAgentList.mockResolvedValue(undefined);
    publishRole('viewer');
  });
  afterEach(cleanup);

  it('disables New Agent for a viewer while preserving the shared no-create guard', async () => {
    const user = userEvent.setup();
    mountSettings();
    const button = newAgentButton();
    await user.click(button);
    await user.keyboard('{Enter}');
    expect(offline.openConnectAgentModal).not.toHaveBeenCalled();
    expect(offline.refreshAgentList).not.toHaveBeenCalled();
    expect(offline.navigate).not.toHaveBeenCalled();
    // Original 264 leaves this real button enabled while createAgent returns early.
    // Keep the disabled assertion after actual input and guard observations.
    expect(button).toBeDisabled();
  });

  it.each([
    { name: 'missing membership', role: null, patch: {} },
    { name: 'unknown role', role: 'unknown-role', patch: {} },
    { name: 'loading writable membership', role: 'member', patch: { isLoading: true } },
    {
      name: 'failed writable membership refresh',
      role: 'member',
      patch: { error: new Error('offline refresh failed') },
    },
  ])('denies creation for $name', async ({ role, patch }) => {
    publishRole(role, patch);
    const user = userEvent.setup();
    mountSettings();
    expect(newAgentButton()).toBeDisabled();
    await user.click(newAgentButton());
    await user.tab();
    await user.keyboard(' ');
    expect(offline.openConnectAgentModal).not.toHaveBeenCalled();
    expect(offline.navigate).not.toHaveBeenCalled();
  });

  it('keeps permitted creation on the real shared settings-origin path', async () => {
    publishRole('member');
    const user = userEvent.setup();
    mountSettings();
    expect(newAgentButton()).toBeEnabled();
    await user.tab();
    expect(newAgentButton()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(offline.openConnectAgentModal).toHaveBeenCalledTimes(1);
    const options = offline.openConnectAgentModal.mock.calls[0][0];
    expect(options.visibility).toBe('private');
    expect(offline.navigate).not.toHaveBeenCalled();
    await act(async () => {
      await options.onCreated('agent-9', { name: 'Code helper' });
    });
    expect(offline.refreshAgentList).toHaveBeenCalledTimes(1);
    expect(offline.navigate).toHaveBeenCalledWith('/settings/agents/agent-9');
    expect(offline.openNewConversation).not.toHaveBeenCalled();
    expect(offline.toastSuccess).toHaveBeenCalledTimes(1);
    const toast = offline.toastSuccess.mock.calls[0][0];
    toast.actions[0].onClick();
    expect(offline.removeAgent).toHaveBeenCalledWith('agent-9');
  });

  it('keeps pending refresh disabled and releases it after creation completes', async () => {
    publishRole('member');
    let releaseRefresh: (() => void) | undefined;
    offline.refreshAgentList.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRefresh = resolve;
        }),
    );
    const user = userEvent.setup();
    mountSettings();
    await user.click(newAgentButton());
    const options = offline.openConnectAgentModal.mock.calls[0][0];
    let completion: Promise<void> | undefined;
    await act(async () => {
      completion = options.onCreated('agent-busy', { title: 'Busy Agent' });
    });
    expect(newAgentButton()).toBeDisabled();
    await user.click(newAgentButton());
    expect(offline.openConnectAgentModal).toHaveBeenCalledTimes(1);
    await act(async () => {
      releaseRefresh?.();
      await completion;
    });
    expect(newAgentButton()).toBeEnabled();
    expect(offline.navigate).toHaveBeenCalledWith('/settings/agents/agent-busy');
    expect(offline.openNewConversation).not.toHaveBeenCalled();
  });

  it('follows live membership revocation and restoration in the mounted page', async () => {
    publishRole('member');
    const user = userEvent.setup();
    mountSettings();
    expect(newAgentButton()).toBeEnabled();
    act(() => publishRole('viewer'));
    expect(newAgentButton()).toBeDisabled();
    await user.click(newAgentButton());
    expect(offline.openConnectAgentModal).not.toHaveBeenCalled();
    act(() => publishRole('member'));
    expect(newAgentButton()).toBeEnabled();
    await user.click(newAgentButton());
    expect(offline.openConnectAgentModal).toHaveBeenCalledTimes(1);
  });

  it('preserves personal-mode creation without workspace membership', async () => {
    publishRole(null, { workspaceId: null });
    const user = userEvent.setup();
    mountSettings();
    expect(newAgentButton()).toBeEnabled();
    await user.click(newAgentButton());
    expect(offline.openConnectAgentModal).toHaveBeenCalledTimes(1);
  });
});
