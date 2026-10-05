/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateMenuItems } from './useCreateMenuItems';
import { useSessionGroupMenuItems } from './useSessionGroupMenuItems';

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  requestAgentRuntime: vi.fn(),
  createGroup: vi.fn(),
  createGroupWithMembers: vi.fn(),
  navigate: vi.fn(),
  openNewConversation: vi.fn(),
  canCreate: { current: true },
  refreshAgentList: vi.fn(),
  loadGroups: vi.fn(),
  addGroup: vi.fn(),
  switchToGroup: vi.fn(),
  removeAgent: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/components/Modal', () => ({ confirmModal: vi.fn() }));
vi.mock('@/features/EditingPopover/store', () => ({ openEditingPopover: vi.fn() }));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/features/Conversation/selectAgent', () => ({
  openNewConversation: mocks.openNewConversation,
}));

vi.mock('@/features/CreateAgent', () => ({ requestAgentRuntime: mocks.requestAgentRuntime }));

vi.mock('@/features/ConnectAgent', () => ({
  openConnectAgentModal: vi.fn(),
}));

vi.mock('@/features/HomeSidebar/Body/Agent/ModalProvider', () => ({
  useOptionalAgentModal: () => undefined,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: mocks.canCreate.current }),
}));

vi.mock('@/components/ChatGroupWizard/templates', () => ({
  useGroupTemplates: () => [
    {
      id: 'team',
      title: 'Team',
      members: [
        { title: 'Writer', systemRole: 'Write prose' },
        { title: 'Editor', systemRole: 'Edit prose' },
      ],
    },
  ],
}));

vi.mock('@/services/chatGroup', () => ({
  chatGroupService: { createGroupWithMembers: mocks.createGroupWithMembers },
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) =>
    selector({ createAgent: mocks.createAgent }),
}));

vi.mock('@/store/agentGroup', () => ({
  useAgentGroupStore: (selector: (state: unknown) => unknown) =>
    selector({ createGroup: mocks.createGroup, loadGroups: mocks.loadGroups }),
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: unknown) => unknown) =>
    selector({
      privateAgentGroups: [{ id: 'private-category' }],
      addGroup: mocks.addGroup,
      refreshAgentList: mocks.refreshAgentList,
      switchToGroup: mocks.switchToGroup,
      removeAgent: mocks.removeAgent,
    }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/toast', () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess },
}));

describe('useCreateMenuItems.createAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestAgentRuntime.mockResolvedValue({
      agencyConfig: {
        executionTarget: 'device',
        boundDeviceId: 'host-1',
        heterogeneousProvider: { type: 'orvilo', model: 'prime-model' },
      },
      model: 'prime-model',
      provider: 'openai',
      title: 'Orvilo AI',
    });
    mocks.createAgent.mockResolvedValue({ agentId: 'agent-9' });
    mocks.refreshAgentList.mockResolvedValue(undefined);
  });

  it('creates Prime only after the user selects its host and executable model', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();

    expect(mocks.createAgent).toHaveBeenCalledTimes(1);
    const params = mocks.createAgent.mock.calls[0][0];
    expect(params.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(params.config.agencyConfig.heterogeneousProvider).toEqual({
      type: 'orvilo',
      model: 'prime-model',
    });
    expect(params.config.agencyConfig.boundDeviceId).toBe('host-1');
    expect(params.config.provider).toBe('openai');
    expect(params.config.model).toBe('prime-model');
    expect(params.config.title).toBe('Orvilo AI');
    expect(params.config.systemRole).toBeUndefined();
    expect(params.config).not.toHaveProperty('purpose');
  });

  it('creates nothing and leaves navigation unchanged when runtime selection is dismissed', async () => {
    mocks.requestAgentRuntime.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.openNewConversation).not.toHaveBeenCalled();
  });

  it('uses an explicitly selected imported runtime instead of inventing a builtin binding', async () => {
    mocks.requestAgentRuntime.mockResolvedValue({
      agencyConfig: {
        executionTarget: 'device',
        boundDeviceId: 'host-2',
        heterogeneousProvider: {
          type: 'codex',
          command: 'codex',
        },
      },
      title: 'Codex',
      model: 'gpt-model',
      provider: 'codex',
    });
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    expect(mocks.createAgent.mock.calls[0][0].config.agencyConfig.heterogeneousProvider.type).toBe(
      'codex',
    );
    expect(mocks.createAgent.mock.calls[0][0].config.agencyConfig.boundDeviceId).toBe('host-2');
  });

  it('a fresh clientRequestId per click — the key exists on every call', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    await result.current.createAgent();

    const [a, b] = mocks.createAgent.mock.calls.map(([params]) => params.clientRequestId);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('chat origin selects the new agent and opens a blank conversation', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent({ origin: 'chat' });

    expect(mocks.openNewConversation).toHaveBeenCalledWith({ agentId: 'agent-9' });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('settings origin stays in the new agent’s settings without touching chat', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent({ origin: 'settings' });

    expect(mocks.navigate).toHaveBeenCalledWith('/settings/agents/agent-9');
    expect(mocks.openNewConversation).not.toHaveBeenCalled();
  });

  it('announces the create with a delete-undo action', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();

    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    const [options] = mocks.toastSuccess.mock.calls[0];
    expect(options.title).toBe('agentCreated');
    expect(options.actions).toHaveLength(1);
    options.actions[0].onClick();
    expect(mocks.removeAgent).toHaveBeenCalledWith('agent-9');
  });

  it('forwards groupId and visibility without minting anything extra', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent({ groupId: 'g1', visibility: 'private' });

    const params = mocks.createAgent.mock.calls[0][0];
    expect(params.groupId).toBe('g1');
    expect(params.visibility).toBe('private');
    expect(mocks.requestAgentRuntime).toHaveBeenCalledWith({ visibility: 'private' });
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });

  it('creates nothing when the caller lacks create permission', async () => {
    mocks.canCreate.current = false;
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.requestAgentRuntime).not.toHaveBeenCalled();
    mocks.canCreate.current = true;
  });
});

describe('template runtime admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGroupWithMembers.mockResolvedValue({ groupId: 'new-group' });
  });
  it('does not insert a template group when runtime selection is cancelled', async () => {
    mocks.requestAgentRuntime.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreateMenuItems());
    let created;
    await act(async () => {
      created = await result.current.createGroupFromTemplate('team');
    });
    expect(created).toBe(false);
    expect(mocks.createGroupWithMembers).not.toHaveBeenCalled();
  });
  it('chooses one runtime for the whole template while preserving member prompts', async () => {
    const runtime = {
      agencyConfig: {
        executionTarget: 'device',
        boundDeviceId: 'host-2',
        heterogeneousProvider: { type: 'codex' },
      },
      model: 'gpt-model',
      provider: 'codex',
      title: 'Codex',
    };
    mocks.requestAgentRuntime.mockResolvedValue(runtime);
    const { result } = renderHook(() => useCreateMenuItems());
    let created;
    await act(async () => {
      created = await result.current.createGroupFromTemplate('team');
    });
    expect(created).toBe(true);
    expect(mocks.requestAgentRuntime).toHaveBeenCalledTimes(1);
    const [, members] = mocks.createGroupWithMembers.mock.calls[0];
    expect(members.map((member: any) => member.agencyConfig)).toEqual([
      runtime.agencyConfig,
      runtime.agencyConfig,
    ]);
    expect(members.map((member: any) => [member.title, member.systemRole])).toEqual([
      ['Writer', 'Write prose'],
      ['Editor', 'Edit prose'],
    ]);
  });
});

describe('category template runtime admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGroup.mockResolvedValue('new-group');
    mocks.createAgent.mockResolvedValue({ agentId: 'member' });
  });
  it('cancelling the chooser inserts neither members nor group', async () => {
    mocks.requestAgentRuntime.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessionGroupMenuItems());
    await act(async () => {
      expect(await result.current.createGroupFromTemplate('team')).toBe(false);
    });
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });
  it('uses the private category host pool once for every selected member', async () => {
    vi.useFakeTimers();
    const runtime = {
      agencyConfig: {
        executionTarget: 'device',
        boundDeviceId: 'host-private',
        heterogeneousProvider: { type: 'orvilo', model: 'prime-model' },
      },
      model: 'prime-model',
      provider: 'openai',
      title: 'Orvilo AI',
    };
    mocks.requestAgentRuntime.mockResolvedValue(runtime);
    const { result } = renderHook(() => useSessionGroupMenuItems());
    await act(async () => {
      const pending = result.current.createGroupFromTemplate('team', undefined, {
        groupId: 'private-category',
      });
      await vi.runAllTimersAsync();
      expect(await pending).toBe(true);
    });
    expect(mocks.requestAgentRuntime).toHaveBeenCalledExactlyOnceWith({ visibility: 'private' });
    expect(
      mocks.createAgent.mock.calls.map(([params]) => [
        params.config.agencyConfig,
        params.visibility,
      ]),
    ).toEqual([
      [runtime.agencyConfig, 'private'],
      [runtime.agencyConfig, 'private'],
    ]);
    expect(mocks.createGroup.mock.calls[0][0]).toMatchObject({
      groupId: 'private-category',
      visibility: 'private',
    });
    vi.useRealTimers();
  });
});
