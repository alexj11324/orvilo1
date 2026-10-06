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
  openConnectAgentModal: vi.fn(),
  openCreateGroupChatModal: vi.fn(),
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
  openConnectAgentModal: mocks.openConnectAgentModal,
}));

vi.mock('@/features/CreateGroupChat', () => ({
  openCreateGroupChatModal: mocks.openCreateGroupChatModal,
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

describe('unified creation entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canCreate.current = true;
    mocks.refreshAgentList.mockResolvedValue(undefined);
  });

  it('opening or dismissing creation never creates an Agent or changes navigation', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    expect(mocks.openConnectAgentModal).toHaveBeenCalledTimes(1);
    expect(mocks.requestAgentRuntime).not.toHaveBeenCalled();
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.openNewConversation).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each(['chat', 'settings'] as const)(
    'completing creation returns to its %s origin',
    async (origin) => {
      const { result } = renderHook(() => useCreateMenuItems());
      await result.current.createAgent({ origin });
      const options = mocks.openConnectAgentModal.mock.calls[0][0];
      await act(async () => {
        await options.onCreated('agent-9', { name: 'Code helper' });
      });
      if (origin === 'settings') {
        expect(mocks.navigate).toHaveBeenCalledWith('/settings/agents/agent-9');
        expect(mocks.openNewConversation).not.toHaveBeenCalled();
      } else {
        expect(mocks.openNewConversation).toHaveBeenCalledWith({ agentId: 'agent-9' });
        expect(mocks.navigate).not.toHaveBeenCalled();
      }
      expect(mocks.refreshAgentList).toHaveBeenCalledTimes(1);
      expect(mocks.createAgent).not.toHaveBeenCalled();
      const toast = mocks.toastSuccess.mock.calls[0][0];
      toast.actions[0].onClick();
      expect(mocks.removeAgent).toHaveBeenCalledWith('agent-9');
    },
  );

  it('keeps category, visibility and chosen Agent in the shared form', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent({
      groupId: 'g1',
      visibility: 'private',
      initialType: 'opencode',
    });
    expect(mocks.openConnectAgentModal).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g1',
        visibility: 'private',
        initialType: 'opencode',
      }),
    );
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });

  it('denies opening creation without create permission', async () => {
    mocks.canCreate.current = false;
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    expect(mocks.openConnectAgentModal).not.toHaveBeenCalled();
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it('group creation opens prerequisites instead of creating an empty group immediately', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createEmptyGroup({ groupId: 'g1', visibility: 'private' });
    expect(mocks.openCreateGroupChatModal).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g1',
        visibility: 'private',
      }),
    );
    expect(mocks.createGroup).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('lists conversation, group chat and Agent creation in the approved order', () => {
    const { result } = renderHook(() => useCreateMenuItems());
    expect(result.current.createTopLevelMenuItems().map((item) => item.key ?? item.type)).toEqual([
      'newConversation',
      'newGroupChat',
      'divider',
      'newAgent',
      'divider',
    ]);
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
