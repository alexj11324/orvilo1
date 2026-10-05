/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTopicActionsDropdownMenu } from './useDropdownMenu';

const permissionMock = vi.hoisted(() => ({
  create_content: true,
  edit_own_content: true,
}));
const workspaceMock = vi.hoisted(() => ({ activeWorkspaceId: null as string | null }));
const workspaceOwnerMock = vi.hoisted(() => ({ isOwner: false }));
const confirmModalMock = vi.hoisted(() => vi.fn());
const openWorkspaceDeleteAllModalMock = vi.hoisted(() => vi.fn());
const removeSessionTopicsMock = vi.hoisted(() => vi.fn());
const removeUnstarredTopicMock = vi.hoisted(() => vi.fn());
const groupMock = vi.hoisted(() => ({ mode: 'byTime', ids: [] as string[] }));
const globalMock = vi.hoisted(() => ({
  collapsedKeys: [] as string[],
  updateSystemStatus: vi.fn(),
}));

const userMock = vi.hoisted(() => ({ currentUserId: 'user-1' as string | undefined }));

const chatStoreMock = vi.hoisted(() => ({
  refreshTopic: vi.fn(),
  topics: [] as Array<Record<string, unknown>>,
  updateTopicStatus: vi.fn(),
}));

const messageMock = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn() }));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => workspaceMock.activeWorkspaceId,
}));

vi.mock('@/business/client/hooks/useIsWorkspaceOwner', () => ({
  useIsWorkspaceOwner: () => workspaceOwnerMock.isOwner,
}));

vi.mock('@/features/WorkspaceDeleteAllModal', () => ({
  openWorkspaceDeleteAllModal: openWorkspaceDeleteAllModalMock,
}));

vi.mock('@/store/user', () => ({
  useUserStore: () => userMock.currentUserId,
}));

vi.mock('@/components/Modal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmModal: confirmModalMock,
}));

vi.mock('@/components/toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: messageMock,
}));

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  App: {
    useApp: () => ({
      message: messageMock,
      modal: {
        confirm: vi.fn(),
        error: vi.fn(),
      },
    }),
  },
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: (action: 'create_content' | 'edit_own_content') => ({
    allowed: permissionMock[action],
    reason: '',
  }),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      importTopic: vi.fn(),
      removeSessionTopics: removeSessionTopicsMock,
      removeUnstarredTopic: removeUnstarredTopicMock,
      refreshTopic: chatStoreMock.refreshTopic,
      topics: chatStoreMock.topics,
      updateTopicStatus: chatStoreMock.updateTopicStatus,
    }),
}));

vi.mock('./hooks/useAgentTopicGroupMode', () => ({
  useAgentTopicGroupMode: () => ({ topicGroupMode: groupMock.mode }),
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    currentTopics: (s: { topics: Array<Record<string, unknown>> }) => s.topics,
    groupedTopicsForSidebar: () => () => groupMock.ids.map((id) => ({ id })),
  },
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      topicPageSize: 20,
      updateSystemStatus: globalMock.updateSystemStatus,
    }),
}));

vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: {
    collapsedTopicGroupKeys: () => () => globalMock.collapsedKeys,
    topicPageSize: (s: { topicPageSize: number }) => s.topicPageSize,
  },
}));

const getMenuItem = (
  items: NonNullable<ReturnType<ReturnType<typeof useTopicActionsDropdownMenu>>>,
  key: string,
) => items.find((item) => item && 'key' in item && item.key === key);

describe('useTopicActionsDropdownMenu', () => {
  beforeEach(() => {
    groupMock.mode = 'byTime';
    groupMock.ids = [];
    globalMock.collapsedKeys = [];
    globalMock.updateSystemStatus.mockReset();
    permissionMock.create_content = true;
    permissionMock.edit_own_content = true;
    workspaceMock.activeWorkspaceId = null;
    workspaceOwnerMock.isOwner = false;
    confirmModalMock.mockReset();
    openWorkspaceDeleteAllModalMock.mockReset();
    removeSessionTopicsMock.mockReset();
    removeUnstarredTopicMock.mockReset();
    userMock.currentUserId = 'user-1';
    chatStoreMock.topics = [];
    chatStoreMock.refreshTopic.mockReset();
    chatStoreMock.updateTopicStatus.mockReset();
    messageMock.info.mockReset();
    messageMock.success.mockReset();
  });

  it('collapses and expands all visible groups through the menu while preserving hidden groups', () => {
    groupMock.ids = ['today', 'yesterday'];
    globalMock.collapsedKeys = ['older'];
    const { result, rerender } = renderHook(() => useTopicActionsDropdownMenu());
    const collapseItem = getMenuItem(result.current()!, 'toggleGroups');

    expect(collapseItem).toMatchObject({ label: 'sidebar.collapseAll' });
    if (collapseItem && 'onClick' in collapseItem) collapseItem.onClick?.({} as never);
    expect(globalMock.updateSystemStatus).toHaveBeenLastCalledWith({
      collapsedTopicGroupKeysByMode: { byTime: ['older', 'today', 'yesterday'] },
    });

    globalMock.collapsedKeys = ['older', 'today', 'yesterday'];
    rerender();
    const expandItem = getMenuItem(result.current()!, 'toggleGroups');
    expect(expandItem).toMatchObject({ label: 'sidebar.expandAll' });
    if (expandItem && 'onClick' in expandItem) expandItem.onClick?.({} as never);
    expect(globalMock.updateSystemStatus).toHaveBeenLastCalledWith({
      collapsedTopicGroupKeysByMode: { byTime: ['older'] },
    });
  });

  it.each([
    ['flat', ['first', 'second']],
    ['byTime', ['only']],
    ['byTime', []],
  ])('hides the group toggle for %s with %j groups', (mode, ids) => {
    groupMock.mode = mode;
    groupMock.ids = ids;
    const { result } = renderHook(() => useTopicActionsDropdownMenu());
    expect(getMenuItem(result.current()!, 'toggleGroups')).toBeUndefined();
  });

  it('disables topic write management actions for workspace viewers', () => {
    permissionMock.create_content = false;
    permissionMock.edit_own_content = false;

    const { result } = renderHook(() => useTopicActionsDropdownMenu());

    expect(getMenuItem(result.current()!, 'import')).toMatchObject({ disabled: true });
    expect(getMenuItem(result.current()!, 'archiveMergedPullRequests')).toMatchObject({
      disabled: true,
    });
    expect(getMenuItem(result.current()!, 'deleteUnstarred')).toBeUndefined();
    expect(getMenuItem(result.current()!, 'deleteAll')).toBeUndefined();
  });

  it('does not expose bulk delete actions in the topic menu', () => {
    const { result } = renderHook(() => useTopicActionsDropdownMenu());

    expect(getMenuItem(result.current()!, 'deleteUnstarred')).toBeUndefined();
    expect(getMenuItem(result.current()!, 'deleteAll')).toBeUndefined();
  });

  it('gives workspace owners separate own and workspace maintenance actions', async () => {
    workspaceMock.activeWorkspaceId = 'workspace-1';
    workspaceOwnerMock.isOwner = true;
    chatStoreMock.topics = [
      {
        id: 'own-merged',
        metadata: {
          workingDirectoryConfig: { git: { github: { pullRequest: { state: 'MERGED' } } } },
        },
        status: 'active',
        userId: 'user-1',
      },
      {
        id: 'other-merged',
        metadata: {
          workingDirectoryConfig: { git: { github: { pullRequest: { state: 'MERGED' } } } },
        },
        status: 'active',
        userId: 'user-2',
      },
    ];

    const { result } = renderHook(() => useTopicActionsDropdownMenu());
    const workspaceArchiveItem = getMenuItem(
      result.current()!,
      'archiveMergedPullRequestsWorkspace',
    );
    const workspaceUnstarredItem = getMenuItem(result.current()!, 'deleteUnstarredWorkspace');
    const workspaceItem = getMenuItem(result.current()!, 'deleteAllWorkspace');

    expect(workspaceArchiveItem).toMatchObject({
      label: 'actions.archiveMergedPullRequestsWorkspace',
    });
    if (workspaceArchiveItem && 'onClick' in workspaceArchiveItem) {
      workspaceArchiveItem.onClick?.({} as never);
    }
    expect(confirmModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'actions.confirmArchiveMergedPullRequestsWorkspace' }),
    );
    await confirmModalMock.mock.calls[0][0].onOk();
    expect(chatStoreMock.updateTopicStatus).toHaveBeenCalledTimes(2);
    expect(chatStoreMock.updateTopicStatus).toHaveBeenCalledWith({
      status: 'archived',
      topicId: 'own-merged',
    });
    expect(chatStoreMock.updateTopicStatus).toHaveBeenCalledWith({
      status: 'archived',
      topicId: 'other-merged',
    });

    expect(workspaceUnstarredItem).toMatchObject({
      label: 'actions.removeUnstarredWorkspace',
    });
    if (workspaceUnstarredItem && 'onClick' in workspaceUnstarredItem) {
      workspaceUnstarredItem.onClick?.({} as never);
    }
    expect(openWorkspaceDeleteAllModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        acknowledgeText: 'actions.confirmRemoveUnstarredWorkspaceAcknowledge',
        description: 'actions.confirmRemoveUnstarredWorkspace',
        title: 'actions.removeUnstarredWorkspace',
      }),
    );
    await openWorkspaceDeleteAllModalMock.mock.calls[0][0].onConfirm();
    expect(removeUnstarredTopicMock).toHaveBeenCalledWith({ onlyOwn: false });

    expect(workspaceItem).toMatchObject({ label: 'actions.removeAllWorkspace' });
    if (workspaceItem && 'onClick' in workspaceItem) workspaceItem.onClick?.({} as never);
    expect(openWorkspaceDeleteAllModalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgeText: 'actions.confirmRemoveAllWorkspaceAcknowledge',
        description: 'actions.confirmRemoveAllWorkspace',
        title: 'actions.removeAllWorkspace',
      }),
    );
    await openWorkspaceDeleteAllModalMock.mock.calls[1][0].onConfirm();
    expect(removeSessionTopicsMock).toHaveBeenCalledWith('workspace');
  });

  it('keeps member maintenance actions but scopes them to topics they created', async () => {
    workspaceMock.activeWorkspaceId = 'workspace-1';
    chatStoreMock.topics = [
      {
        id: 'own-merged',
        metadata: {
          workingDirectoryConfig: { git: { github: { pullRequest: { state: 'MERGED' } } } },
        },
        status: 'active',
        userId: 'user-1',
      },
      {
        id: 'other-merged',
        metadata: {
          workingDirectoryConfig: { git: { github: { pullRequest: { state: 'MERGED' } } } },
        },
        status: 'active',
        userId: 'user-2',
      },
    ];

    const { result } = renderHook(() => useTopicActionsDropdownMenu());
    const archiveItem = getMenuItem(result.current()!, 'archiveMergedPullRequests');

    expect(archiveItem).toMatchObject({ label: 'actions.archiveMergedPullRequestsOwn' });
    if (archiveItem && 'onClick' in archiveItem) await archiveItem.onClick?.({} as never);
    expect(chatStoreMock.updateTopicStatus).toHaveBeenCalledOnce();
    expect(chatStoreMock.updateTopicStatus).toHaveBeenCalledWith({
      status: 'archived',
      topicId: 'own-merged',
    });

    expect(getMenuItem(result.current()!, 'deleteUnstarred')).toBeUndefined();
    expect(getMenuItem(result.current()!, 'deleteAll')).toBeUndefined();
    expect(getMenuItem(result.current()!, 'archiveMergedPullRequestsWorkspace')).toBeUndefined();
    expect(getMenuItem(result.current()!, 'deleteUnstarredWorkspace')).toBeUndefined();
  });

  it('archives only unfinished topics whose pull requests are merged', async () => {
    chatStoreMock.topics = [
      {
        id: 'merged',
        metadata: {
          workingDirectoryConfig: { git: { github: { pullRequest: { state: 'MERGED' } } } },
        },
        status: 'active',
      },
      {
        id: 'open',
        metadata: {
          workingDirectoryConfig: { git: { github: { pullRequest: { state: 'OPEN' } } } },
        },
        status: 'active',
      },
      {
        id: 'completed',
        metadata: {
          workingDirectoryConfig: {
            git: { github: { pullRequest: { mergedAt: '2026-07-10T00:00:00Z' } } },
          },
        },
        status: 'completed',
      },
      {
        id: 'unread',
        metadata: {
          workingDirectoryConfig: { git: { github: { pullRequest: { state: 'MERGED' } } } },
        },
        status: 'unread',
      },
    ];

    const { result } = renderHook(() => useTopicActionsDropdownMenu());
    const item = getMenuItem(result.current()!, 'archiveMergedPullRequests');

    expect(item && 'onClick' in item).toBe(true);
    if (item && 'onClick' in item) await item.onClick?.({} as never);

    expect(chatStoreMock.updateTopicStatus).toHaveBeenCalledOnce();
    expect(chatStoreMock.updateTopicStatus).toHaveBeenCalledWith({
      status: 'archived',
      topicId: 'merged',
    });
    expect(chatStoreMock.refreshTopic).toHaveBeenCalledOnce();
    expect(messageMock.success).toHaveBeenCalledWith('actions.archiveMergedPullRequestsSuccess');
  });
});
