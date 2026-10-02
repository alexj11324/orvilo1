/**
 * @vitest-environment happy-dom
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateMenuItems } from './useCreateMenuItems';

const createAgentMock = vi.hoisted(() => vi.fn().mockResolvedValue({ agentId: 'agent-codex' }));
const refreshAgentListMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const addGroupMock = vi.hoisted(() => vi.fn());
const switchToGroupMock = vi.hoisted(() => vi.fn());
const createGroupMock = vi.hoisted(() => vi.fn());
const loadGroupsMock = vi.hoisted(() => vi.fn());
const messageErrorMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const openConnectAgentModalMock = vi.hoisted(() => vi.fn());
const openCreateGroupModalMock = vi.hoisted(() => vi.fn());
const agentModalMock = vi.hoisted(() => ({
  current: undefined as
    | { openCreateGroupModal: (id?: string, v?: string) => void; openCreateModal?: unknown }
    | undefined,
}));
const openCreateModalMock = vi.hoisted(() => vi.fn());
const swrMutations = vi.hoisted(() => ({
  map: new Map<string, { options?: { onSuccess?: (result: unknown) => void }; trigger: unknown }>(),
}));

vi.mock('@orvilo/const', () => ({
  isDesktop: true,
}));

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  App: {
    useApp: () => ({
      message: { error: messageErrorMock },
      notification: { error: vi.fn() },
    }),
  },
}));

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('swr/mutation', () => ({
  default: (key: string, _fetcher: unknown, options?: { onSuccess?: (r: unknown) => void }) => {
    const entry = { options, trigger: vi.fn() };
    swrMutations.map.set(key, entry);
    return { isMutating: false, trigger: entry.trigger };
  },
}));

vi.mock('@/components/ChatGroupWizard/templates', () => ({
  useGroupTemplates: () => [],
}));

vi.mock('@/features/ConnectAgent', () => ({
  openConnectAgentModal: openConnectAgentModalMock,
}));

vi.mock('@/features/HomeSidebar/Body/Agent/ModalProvider', () => ({
  useOptionalAgentModal: () => agentModalMock.current,
}));

vi.mock('@/services/chatGroup', () => ({
  chatGroupService: {
    createGroupWithMembers: vi.fn(),
  },
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      createAgent: createAgentMock,
    }),
}));

vi.mock('@/store/agentGroup', () => ({
  useAgentGroupStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      createGroup: createGroupMock,
      loadGroups: loadGroupsMock,
    }),
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      addGroup: addGroupMock,
      refreshAgentList: refreshAgentListMock,
      switchToGroup: switchToGroupMock,
    }),
}));

const isActionItem = (
  item: unknown,
): item is {
  label?: unknown;
  key: string;
  onClick?: (info: { domEvent?: { stopPropagation?: () => void } }) => Promise<void> | void;
} => !!item && typeof item === 'object' && 'key' in item;

describe('useCreateMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentModalMock.current = undefined;
    swrMutations.map.clear();
  });

  it('keeps the Agent-list entry without retired marketplace or Page actions', async () => {
    const { result } = renderHook(() => useCreateMenuItems());

    const items = result.current.createTopLevelMenuItems();
    const itemKeys = items.map((item) =>
      isActionItem(item)
        ? item.key
        : item && typeof item === 'object' && 'type' in item
          ? item.type
          : item,
    );

    expect(itemKeys).toEqual([
      'newAgent',
      'newGroupChat',
      'divider',
      'newPlatformAgent',
      'divider',
      'addAgentFromList',
    ]);

    const listItem = items.find((item) => isActionItem(item) && item.key === 'addAgentFromList');

    if (!isActionItem(listItem)) {
      throw new Error('Expected Agent-list menu item');
    }

    expect(listItem.label).toBe('addAgentFromList');

    const listStopPropagation = vi.fn();
    await act(async () => {
      await listItem.onClick?.({ domEvent: { stopPropagation: listStopPropagation } });
    });

    expect(listStopPropagation).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/agents');
    expect(items.some((item) => isActionItem(item) && item.key === 'addAgentFromMarket')).toBe(
      false,
    );
    expect(items.some((item) => isActionItem(item) && item.key === 'newPage')).toBe(false);
  });

  it('opens the agent list on the Private tab for the private bucket', async () => {
    const { result } = renderHook(() => useCreateMenuItems());

    const listItem = result.current.createAgentListMenuItem({ visibility: 'private' });

    if (!isActionItem(listItem)) {
      throw new Error('Expected Agent-list menu item');
    }

    expect(listItem.key).toBe('addPrivateAgentFromList');

    navigateMock.mockClear();
    await act(async () => {
      await listItem.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(navigateMock).toHaveBeenCalledWith('/agents?tab=private');
  });

  it('opens the naming modal when creating a category inside the modal provider', async () => {
    agentModalMock.current = { openCreateGroupModal: openCreateGroupModalMock };

    const { result } = renderHook(() => useCreateMenuItems());

    const groupItem = result.current.createSessionGroupMenuItem({ visibility: 'private' });

    if (!isActionItem(groupItem)) {
      throw new Error('Expected session group menu item');
    }

    await act(async () => {
      await groupItem.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(openCreateGroupModalMock).toHaveBeenCalledWith(undefined, 'private');
    expect(addGroupMock).not.toHaveBeenCalled();
  });

  it('falls back to default-name creation without the modal provider', async () => {
    const { result } = renderHook(() => useCreateMenuItems());

    const groupItem = result.current.createSessionGroupMenuItem();

    if (!isActionItem(groupItem)) {
      throw new Error('Expected session group menu item');
    }

    await act(async () => {
      await groupItem.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(addGroupMock).toHaveBeenCalledWith('sessionGroup.newGroup', undefined);
    expect(openCreateGroupModalMock).not.toHaveBeenCalled();
  });

  it('uses an action-oriented label for category management', () => {
    const { result } = renderHook(() => useCreateMenuItems());

    const configItem = result.current.configMenuItem(vi.fn());

    if (!isActionItem(configItem)) {
      throw new Error('Expected category management menu item');
    }

    expect(configItem.label).toBe('sessionGroup.manageCategory');
  });

  it('opens the connect wizard and renders its explanatory label', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    const connectItem = result.current.createConnectAgentMenuItem();

    if (!isActionItem(connectItem)) throw new Error('Expected Connect Agent menu item');

    render(<>{connectItem.label}</>);
    expect(screen.getByText('newPlatformAgent')).toBeTruthy();
    expect(screen.getByText('newPlatformAgentDesc')).toBeTruthy();

    await act(async () => {
      await connectItem.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });
    expect(openConnectAgentModalMock).toHaveBeenCalledWith(undefined);
  });

  it('threads groupId and visibility into the connect wizard', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    const connectItem = result.current.createConnectAgentMenuItem({
      groupId: 'group-1',
      visibility: 'private',
    });

    if (!isActionItem(connectItem)) throw new Error('Expected Connect Agent menu item');

    await act(async () => {
      await connectItem.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });
    expect(openConnectAgentModalMock).toHaveBeenCalledWith({
      groupId: 'group-1',
      visibility: 'private',
    });
  });

  it('creates the group directly — never through the purpose modal — even when the modal exists', async () => {
    agentModalMock.current = {
      openCreateGroupModal: openCreateGroupModalMock,
      openCreateModal: openCreateModalMock,
    };

    const { result } = renderHook(() => useCreateMenuItems());
    const groupItem = result.current.createGroupChatMenuItem();

    if (!isActionItem(groupItem)) throw new Error('Expected group chat menu item');

    await act(async () => {
      await groupItem.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    const groupMutation = swrMutations.map.get('group.createGroup');
    expect(groupMutation?.trigger).toHaveBeenCalled();
    expect(openCreateModalMock).not.toHaveBeenCalled();
  });

  it('lands inside the new group conversation, not the profile screen', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    const groupItem = result.current.createGroupChatMenuItem();

    if (!isActionItem(groupItem)) throw new Error('Expected group chat menu item');

    await act(async () => {
      await groupItem.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    await act(async () => {
      await swrMutations.map.get('group.createGroup')?.options?.onSuccess?.('group-42');
    });

    expect(navigateMock).toHaveBeenCalledWith('/group/group-42');
  });

  it('offers generate-from-description only as a secondary item when the modal exists', async () => {
    agentModalMock.current = {
      openCreateGroupModal: openCreateGroupModalMock,
      openCreateModal: openCreateModalMock,
    };

    const { result } = renderHook(() => useCreateMenuItems());
    const keys = result.current
      .createTopLevelMenuItems()
      .map((item) => (isActionItem(item) ? item.key : (item as { type?: string })?.type));

    expect(keys).toEqual([
      'newAgent',
      'newGroupChat',
      'newGroupChatFromDescription',
      'divider',
      'newPlatformAgent',
      'divider',
      'addAgentFromList',
    ]);

    const item = result.current.createGroupFromDescriptionMenuItem({ visibility: 'private' });
    if (!item || !isActionItem(item)) throw new Error('Expected description menu item');

    await act(async () => {
      await item.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(openCreateModalMock).toHaveBeenCalledWith('group', { visibility: 'private' });
  });

  it('hides the description affordance without the modal provider', () => {
    const { result } = renderHook(() => useCreateMenuItems());

    const keys = result.current
      .createTopLevelMenuItems()
      .map((item) => (isActionItem(item) ? item.key : (item as { type?: string })?.type));

    expect(keys).not.toContain('newGroupChatFromDescription');
    expect(result.current.createGroupFromDescriptionMenuItem()).toBeNull();
  });
});
