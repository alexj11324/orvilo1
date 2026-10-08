/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateMenuItems } from './useCreateMenuItems';

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

  it('lists conversation and Agent creation without Group creation outside its page', () => {
    const { result } = renderHook(() => useCreateMenuItems());
    expect(result.current.createTopLevelMenuItems().map((item) => item.key ?? item.type)).toEqual([
      'newConversation',
      'divider',
      'newAgent',
      'divider',
    ]);
  });
});
