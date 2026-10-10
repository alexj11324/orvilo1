import type { SidebarAgentItem } from '@orvilo/types';
import { cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AssigneeAgentSelector from '@/features/AgentTasks/features/AssigneeAgentSelector';
import MoveTopicsContent from '@/features/MoveTopicsModal/Content';
import { canGoNative } from '@/libs/contextMenu/canGoNative';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';

import AgentItem from './index';
import { useAgentDropdownMenu } from './useDropdownMenu';

const mocks = vi.hoisted(() => ({
  canCreate: true,
  canEdit: true,
  canEditResource: false,
  canManageResource: false,
  canManage: false,
  confirmModal: vi.fn(),
  toastError: vi.fn(),
  activeWorkspaceId: 'workspace-1' as string | null,
  home: {
    duplicateAgent: vi.fn(),
    pinAgent: vi.fn(),
    refreshAgentList: vi.fn(),
    removeAgent: vi.fn(),
    updateAgentGroup: vi.fn(),
  },
  navigate: vi.fn(),
  openAgentInNewWindow: vi.fn(),
  transferMenuItems: null as null | { key: string; label: string }[],
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    App: Object.assign(actual.App as object, {
      useApp: () => ({
        message: { error: vi.fn(), success: vi.fn() },
      }),
    }),
  };
});

vi.mock('@/components/Modal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmModal: mocks.confirmModal,
  useModalContext: () => ({ close: vi.fn(), setCanDismissByClickOutside: vi.fn() }),
}));
vi.mock('@/components/toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: { error: mocks.toastError, success: vi.fn() },
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('@/business/client/hooks/useAgentTransferMenuItem', () => ({
  useAgentTransferMenuItem: () => mocks.transferMenuItems,
}));

vi.mock('@/features/EditingPopover/store', () => ({ openEditingPopover: vi.fn() }));

vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: () => ({
    canEditResource: mocks.canEditResource,
    canManageResource: mocks.canManageResource,
    isAccessResolved: true,
  }),
}));

vi.mock('@/features/VisibilityConfirmContent', () => ({ default: () => null }));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: (action: 'create_content' | 'edit_own_content') => ({
    allowed: action === 'create_content' ? mocks.canCreate : mocks.canEdit,
    reason: '',
  }),
}));

vi.mock('@/hooks/useResourceManageable', () => ({
  useResourceManageable: () => mocks.canManage,
}));

vi.mock('@/services/agent', () => ({ agentService: {} }));

vi.mock('@/features/HomeSidebar/Body/Agent/ModalProvider', () => ({
  useOptionalAgentModal: () => null,
  useAgentModal: () => ({ openCreateGroupModal: vi.fn() }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { openAgentInNewWindow: typeof vi.fn }) => unknown) =>
    selector({ openAgentInNewWindow: mocks.openAgentInNewWindow }),
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: typeof mocks.home) => unknown) => selector(mocks.home),
}));

vi.mock('@/store/home/selectors', () => ({
  homeAgentListSelectors: {
    allAgents: () => [
      {
        id: 'codex-option',
        type: 'agent',
        title: 'Renamed Codex',
        heterogeneousType: 'codex',
        pinned: false,
        updatedAt: new Date(),
      } satisfies SidebarAgentItem,
    ],
    isAgentListInit: () => true,
    pinnedAgents: () => [],
    ungroupedAgents: () => [
      {
        id: 'codex-option',
        type: 'agent',
        title: 'Renamed Codex',
        heterogeneousType: 'codex',
        pinned: false,
        updatedAt: new Date(),
      } satisfies SidebarAgentItem,
    ],
    privatePinnedAgents: () => [],
    privateUngroupedAgents: () => [],
    hasPrivateAgents: () => false,
    agentGroups: () => [],
    privateAgentGroups: () => [],
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: { userId: string }) => unknown) =>
    selector({ userId: 'member-1' }),
}));

vi.mock('@/store/user/selectors', () => ({
  userProfileSelectors: { userId: (state: { userId: string }) => state.userId },
}));

vi.mock('../../../../hooks', () => ({ useRevealSidebarSection: () => vi.fn() }));

vi.mock('@/hooks/useFetchAgentList', () => ({ useFetchAgentList: () => undefined }));
vi.mock('@/store/agent', () => ({ useAgentStore: () => undefined }));
vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: { getAgentMetaById: () => () => undefined },
  builtinAgentSelectors: { inboxAgentId: () => undefined },
}));
vi.mock('@/store/task', () => ({ useTaskStore: () => vi.fn() }));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverContent: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: () => null,
}));
vi.mock('@/hooks/usePrefetchAgent', () => ({ usePrefetchAgent: () => vi.fn() }));
vi.mock('@/store/chat', () => ({ useChatStore: () => false }));
vi.mock('@/store/chat/selectors', () => ({
  operationSelectors: { isAgentVisiblyRunning: () => () => false },
}));
vi.mock('../usePreservedAgentUrl', () => ({
  usePreservedAgentUrl: (id: string) => `/agent/${id}`,
}));
vi.mock('@/features/Workspace/WorkspaceLink', () => ({
  default: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({ icon, title }: { icon: ReactNode; title: ReactNode }) => (
    <div>
      {isValidElement(icon) ? icon : null}
      {title}
    </div>
  ),
}));
vi.mock('../Item/Actions', () => ({ default: () => null }));

const getMenuKeys = (items: ReturnType<ReturnType<typeof useAgentDropdownMenu>>) =>
  (items ?? []).flatMap((item) =>
    item && typeof item === 'object' && 'key' in item && item.key ? [item.key] : [],
  );

const getMenuLayout = (items: ReturnType<ReturnType<typeof useAgentDropdownMenu>>) =>
  (items ?? []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    if ('type' in item && item.type === 'divider') return ['divider'];
    if ('key' in item && item.key) return [item.key];
    return [];
  });

describe('useAgentDropdownMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeWorkspaceId = 'workspace-1';
    mocks.canCreate = true;
    mocks.canEdit = true;
    mocks.canEditResource = false;
    mocks.canManageResource = false;
    mocks.canManage = false;
    mocks.transferMenuItems = null;
  });

  it('renders the actual sidebar item with editable artwork and runtime branding', () => {
    const { container, getByText, rerender } = render(
      <AgentItem
        item={{
          id: 'agent-render',
          type: 'agent',
          userId: 'member-1',
          pinned: false,
          updatedAt: new Date(),
          title: 'Renamed Orvilo',
          heterogeneousType: 'orvilo',
          avatar: '⚡',
          backgroundColor: '#fff',
        }}
      />,
    );
    expect(getByText('Renamed Orvilo')).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/app-icons/icon-512x512.png');
    rerender(
      <AgentItem
        item={{
          id: 'agent-render',
          type: 'agent',
          userId: 'member-1',
          pinned: false,
          updatedAt: new Date(),
          title: 'Renamed Codex',
          avatar: '⚡',
          heterogeneousType: 'codex',
        }}
      />,
    );
    expect(getByText('Renamed Codex')).toBeTruthy();
    expect(container.querySelector('[aria-label="Codex"]')).not.toBeNull();
    expect(container.querySelector('img[src="/app-icons/icon-512x512.png"]')).toBeNull();
  });

  it('passes the actual Home runtime into move-topic and issue-assignee selector rows', () => {
    const move = render(<MoveTopicsContent sourceAgentId="source" topicIds={['topic']} />);
    expect(move.container.querySelector('[aria-label="Codex"]')).not.toBeNull();
    cleanup();
    const assign = render(
      <AssigneeAgentSelector>
        <button>Assign</button>
      </AssigneeAgentSelector>,
    );
    expect(assign.container.querySelector('[aria-label="Codex"]')).not.toBeNull();
  });

  it('keeps non-config actions available to a use-only Workspace member', () => {
    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'creator-1',
        visibility: 'public',
      }),
    );

    expect(getMenuKeys(result.current())).toEqual(['pin', 'openInNewWindow', 'moveGroup']);
  });

  it('allows Agent duplication only on the Agents page', () => {
    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Agent',
        creationEnabled: true,
      }),
    );
    expect(getMenuKeys(result.current())).toContain('duplicate');
  });

  it('offers no Labels submenu (agent labels were removed)', () => {
    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'creator-1',
        visibility: 'public',
      }),
    );

    expect(getMenuKeys(result.current())).not.toContain('labels');
  });

  it('keeps write actions hidden from a Workspace viewer', () => {
    mocks.canCreate = false;
    mocks.canEdit = false;

    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'creator-1',
        visibility: 'public',
      }),
    );

    expect(getMenuKeys(result.current())).toEqual(['openInNewWindow']);
  });

  it('tells the user to wait when delete is refused by a pending history migration', async () => {
    // Regression: a 409 TRANSFER_IN_PROGRESS used to fall through to the
    // generic "operation failed, please try again", which invited immediate
    // retries that could never succeed until the backfill drained.
    mocks.canEditResource = true;
    mocks.canManage = true;
    mocks.home.removeAgent.mockRejectedValueOnce(
      Object.assign(new Error('migrating'), {
        data: { code: 'CONFLICT', errorData: { code: 'TRANSFER_IN_PROGRESS' }, httpStatus: 409 },
      }),
    );

    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'member-1',
        visibility: 'public',
      }),
    );

    const deleteItem = (result.current() ?? []).find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'delete',
    ) as { onClick: (info: { domEvent: { stopPropagation: () => void } }) => void } | undefined;
    if (!deleteItem) throw new Error('Expected delete menu item');

    deleteItem.onClick({ domEvent: { stopPropagation: vi.fn() } });
    const { onOk } = mocks.confirmModal.mock.calls[0][0] as { onOk: () => Promise<void> };
    await onOk();

    expect(mocks.toastError).toHaveBeenCalledWith('deleteHistoryMigrating');
  });

  it('stays native-eligible (string labels only, including the Move to Category submenu)', () => {
    mocks.canEditResource = true;

    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'member-1',
        visibility: 'public',
      }),
    );

    expect(canGoNative((result.current() ?? []) as NativeContextMenuItem[])).toBe(true);
  });

  it('groups display, organization, access, and destructive actions by intent', () => {
    mocks.canEditResource = true;
    mocks.canManage = true;
    mocks.canManageResource = true;
    mocks.transferMenuItems = [{ key: 'copy-agent', label: 'Copy to…' }];

    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'member-1',
        visibility: 'public',
      }),
    );

    expect(getMenuLayout(result.current())).toEqual([
      'pin',
      'openInNewWindow',
      'divider',
      'rename',
      'moveGroup',
      'copy-agent',
      'divider',
      'permission',
      'makePrivate',
      'divider',
      'delete',
    ]);
  });

  it('hides the Permission shortcut from a non-author member who can configure the agent', () => {
    mocks.canEditResource = true;

    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'member-1',
        visibility: 'public',
      }),
    );

    expect(getMenuKeys(result.current())).not.toContain('permission');
  });

  it('offers the Permission shortcut to the creator or a workspace owner', () => {
    mocks.canEditResource = true;
    mocks.canManageResource = true;

    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Public Agent',
        userId: 'member-1',
        visibility: 'public',
      }),
    );

    const permissionItem = (result.current() ?? []).find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'permission',
    ) as { onClick: (info: { domEvent: { stopPropagation: () => void } }) => void } | undefined;

    expect(permissionItem).toBeTruthy();

    permissionItem?.onClick({ domEvent: { stopPropagation: vi.fn() } });

    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agent-1/permission');
  });

  it('hides the Permission shortcut in personal mode — there are no members to scope', () => {
    mocks.activeWorkspaceId = null;
    mocks.canEditResource = true;

    const { result } = renderHook(() =>
      useAgentDropdownMenu({
        anchor: null,
        group: undefined,
        id: 'agent-1',
        openCreateGroupModal: vi.fn(),
        pinned: false,
        title: 'Personal Agent',
        userId: 'member-1',
        visibility: 'private',
      }),
    );

    expect(getMenuKeys(result.current())).not.toContain('permission');
  });
});
