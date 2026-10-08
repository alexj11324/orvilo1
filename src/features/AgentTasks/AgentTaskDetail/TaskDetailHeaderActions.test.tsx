/**
 * @vitest-environment happy-dom
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TaskDetailHeaderActions from './TaskDetailHeaderActions';

interface MenuItem {
  children?: MenuItem[];
  disabled?: boolean;
  extra?: ReactNode;
  key?: string;
  label?: ReactNode;
  onClick?: () => void;
  type?: string;
}

const submenu = (key: string) => mocks.dropdownItems.find((item) => item?.key === key)?.children;
const submenuKeys = (key: string) => submenu(key)?.map((item) => item.key);

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'ws-1' as string | undefined,
  appNavigate: vi.fn(),
  confirmModal: vi.fn(),
  createTask: vi.fn(),
  currentUserId: 'user-1' as string | undefined,
  deleteTask: vi.fn(),
  dropdownItems: [] as MenuItem[],
  isWorkspaceOwner: false,
  moveWorkflow: vi.fn(),
  messageSuccess: vi.fn(),
  navigate: vi.fn(),
  permissionAllowed: true,
  removeDependency: vi.fn(),
  removeIssueRelation: vi.fn(),
  taskState: {
    activeTaskId: 'T-1' as string | undefined,
    taskDetailMap: {
      'T-1': { visibility: 'private' as 'private' | 'public' },
    } as Record<string, Record<string, unknown>>,
  },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toggleTaskLabel: vi.fn(),
  transferItems: [
    { key: 'transfer-task', label: 'Move to…' },
    { key: 'copy-task', label: 'Copy to...' },
  ] as MenuItem[],
  updateTask: vi.fn(),
  updateTaskVisibility: vi.fn(),
}));

vi.mock('@/components/toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: { error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning },
}));

vi.mock('@/features/Electron/navigation/appNavigate', () => ({
  appNavigate: mocks.appNavigate,
}));

vi.mock('../features/useIssueStatusMove', () => ({
  useIssueStatusMove: () => mocks.moveWorkflow,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: mocks.permissionAllowed }),
}));

vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({ children, items }: { children?: ReactNode; items: MenuItem[] }) => {
    mocks.dropdownItems = items;
    return <>{children}</>;
  },
}));

vi.mock('@/components/Modal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmModal: (opts: unknown) => mocks.confirmModal(opts),
}));

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  App: {
    useApp: () => ({
      message: { success: mocks.messageSuccess },
    }),
  },
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => 'ws-slug',
}));

vi.mock('@/business/client/hooks/useIsWorkspaceOwner', () => ({
  useIsWorkspaceOwner: () => mocks.isWorkspaceOwner,
}));

vi.mock('@/features/VisibilityConfirmContent', () => ({
  default: () => <div />,
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: Record<string, unknown>) => unknown) => selector({}),
}));

vi.mock('@/store/user/selectors', () => ({
  userProfileSelectors: {
    userId: () => mocks.currentUserId,
  },
}));

vi.mock('@/business/client/hooks/useTaskTransferMenuItem', () => ({
  useTaskTransferMenuItem: vi.fn(() => mocks.transferItems),
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/useAppOrigin', () => ({
  useAppOrigin: () => 'https://example.com',
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      ...mocks.taskState,
      createTask: mocks.createTask,
      deleteTask: mocks.deleteTask,
      toggleTaskLabel: mocks.toggleTaskLabel,
      removeDependency: mocks.removeDependency,
      removeIssueRelation: mocks.removeIssueRelation,
      updateTask: mocks.updateTask,
      updateTaskVisibility: mocks.updateTaskVisibility,
    }),
}));

describe('TaskDetailHeaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dropdownItems = [];
    mocks.taskState.activeTaskId = 'T-1';
    mocks.taskState.taskDetailMap = { 'T-1': { visibility: 'private' } };
    mocks.activeWorkspaceId = 'ws-1';
    mocks.currentUserId = 'user-1';
    mocks.isWorkspaceOwner = false;
    mocks.permissionAllowed = true;
    mocks.moveWorkflow.mockResolvedValue(true);
    mocks.toggleTaskLabel.mockResolvedValue(undefined);
    mocks.updateTask.mockResolvedValue(undefined);
    mocks.removeDependency.mockResolvedValue(undefined);
    mocks.removeIssueRelation.mockResolvedValue(undefined);
  });

  it('includes task transfer and copy actions in the detail menu', () => {
    render(<TaskDetailHeaderActions />);

    expect(mocks.dropdownItems.map((item) => item?.key)).toContain('transfer-task');
    expect(mocks.dropdownItems.map((item) => item?.key)).toContain('copy-task');
  });

  it.each(['private', 'public'] as const)(
    'offers no privacy transition for %s tasks',
    (visibility) => {
      mocks.taskState.taskDetailMap = {
        'T-1': { createdByUserId: 'user-1', visibility },
      };
      render(<TaskDetailHeaderActions />);

      const keys = mocks.dropdownItems.map((item) => item?.key);
      expect(keys).not.toContain('publishToWorkspace');
      expect(keys).not.toContain('makePrivate');
      expect(keys).toEqual(
        expect.arrayContaining(['copy', 'transfer-task', 'copy-task', 'delete']),
      );
      expect(mocks.updateTaskVisibility).not.toHaveBeenCalled();
    },
  );

  it('groups the clipboard actions into one Copy submenu', () => {
    render(<TaskDetailHeaderActions />);

    const keys = mocks.dropdownItems.map((item) => item?.key);
    expect(keys).not.toContain('copyId');
    expect(keys).not.toContain('copyLink');
    expect(submenuKeys('copy')).toEqual([
      'copyId',
      'copyLink',
      'copyTitle',
      'copyTitleAsLink',
      'copyMarkdown',
    ]);
  });

  it('adds the branch entry to the Copy submenu only for workspace-bound tasks', () => {
    mocks.taskState.taskDetailMap = {
      'T-1': { config: { workspace: { provider: 'git' } }, identifier: 'ENG-1' },
    };
    render(<TaskDetailHeaderActions />);

    expect(submenuKeys('copy')).toContain('copyBranch');
  });

  it('offers no Remove submenu for an issue with nothing linked', () => {
    render(<TaskDetailHeaderActions />);

    expect(mocks.dropdownItems.map((item) => item?.key)).not.toContain('remove');
  });

  it('lists the parent, each sub-issue and each relation under Remove', () => {
    mocks.taskState.taskDetailMap = {
      'T-1': {
        dependencies: [
          { dependsOn: 'ENG-5', id: 'uuid-5', type: 'blocks' },
          { dependsOn: 'ENG-6', direction: 'blocking', type: 'blocks' },
          { dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' },
          { dependsOn: 'ENG-8', type: 'duplicates' },
        ],
        parent: { identifier: 'ENG-1', name: 'Parent' },
        subtasks: [{ identifier: 'ENG-2', status: 'backlog' }],
      },
    };
    render(<TaskDetailHeaderActions />);

    expect(submenu('remove')?.map((item) => [item.key, item.label, item.extra])).toEqual([
      ['remove-parent', 'taskDetail.menu.removeParent', 'ENG-1'],
      ['remove-sub-issue-ENG-2', 'taskDetail.menu.removeSubIssue', 'ENG-2'],
      ['remove-relation-blockedBy-ENG-5', 'taskDetail.menu.removeBlocking', 'ENG-5'],
      ['remove-relation-blocking-ENG-6', 'taskDetail.menu.removeBlocked', 'ENG-6'],
      ['remove-relation-rel-7', 'taskDetail.menu.removeRelated', 'ENG-7'],
    ]);
  });

  it('detaches the parent and a sub-issue by clearing the child side of the edge', () => {
    mocks.taskState.taskDetailMap = {
      'T-1': {
        parent: { identifier: 'ENG-1', name: 'Parent' },
        subtasks: [{ identifier: 'ENG-2', status: 'backlog' }],
      },
    };
    render(<TaskDetailHeaderActions />);

    submenu('remove')?.[0].onClick?.();
    expect(mocks.updateTask).toHaveBeenLastCalledWith('T-1', { parentTaskId: null });

    submenu('remove')?.[1].onClick?.();
    expect(mocks.updateTask).toHaveBeenLastCalledWith('ENG-2', { parentTaskId: null });
  });

  it('unlinks each relation from the side that owns the edge', () => {
    mocks.taskState.taskDetailMap = {
      'T-1': {
        dependencies: [
          { dependsOn: 'ENG-5', id: 'uuid-5', type: 'blocks' },
          { dependsOn: 'ENG-6', direction: 'blocking', type: 'blocks' },
          { dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' },
          { dependsOn: 'ENG-9', type: 'relates' },
        ],
      },
    };
    render(<TaskDetailHeaderActions />);

    for (const item of submenu('remove') ?? []) item.onClick?.();

    expect(mocks.removeDependency.mock.calls).toEqual([
      ['T-1', 'uuid-5', 'blocks'],
      ['ENG-6', 'T-1', 'blocks'],
      ['T-1', 'ENG-9', 'relates'],
    ]);
    expect(mocks.removeIssueRelation.mock.calls).toEqual([['T-1', 'rel-7']]);
  });

  it('reports a relation that could not be removed', async () => {
    mocks.removeIssueRelation.mockRejectedValue(new Error('nope'));
    mocks.taskState.taskDetailMap = {
      'T-1': { dependencies: [{ dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' }] },
    };
    render(<TaskDetailHeaderActions />);

    submenu('remove')?.[0].onClick?.();

    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('taskDetail.menu.removeFailed'),
    );
  });

  it('disables every Remove entry without edit permission', () => {
    mocks.permissionAllowed = false;
    mocks.taskState.taskDetailMap = {
      'T-1': {
        dependencies: [{ dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' }],
        parent: { identifier: 'ENG-1', name: 'Parent' },
      },
    };
    render(<TaskDetailHeaderActions />);

    expect(submenu('remove')?.map((item) => item.disabled)).toEqual([true, true]);
  });

  it('orders the menu open/copy, duplicate/remove, transfer, close, delete', () => {
    mocks.taskState.taskDetailMap = { 'T-1': { parent: { identifier: 'ENG-1', name: 'P' } } };
    render(<TaskDetailHeaderActions />);

    expect(mocks.dropdownItems.filter(Boolean).map((item) => item.key ?? item.type)).toEqual([
      'openInNewTab',
      'copy',
      'divider',
      'makeCopy',
      'remove',
      'divider',
      'transfer-task',
      'copy-task',
      'divider',
      'cancel',
      'divider',
      'delete',
    ]);
  });

  it('opens the task route in a new tab through the host navigation adapter', () => {
    mocks.taskState.taskDetailMap = { 'T-1': { agentId: 'agt_1', name: 'Ship it' } };
    render(<TaskDetailHeaderActions />);

    mocks.dropdownItems.find((entry) => entry?.key === 'openInNewTab')?.onClick?.();

    expect(mocks.appNavigate).toHaveBeenCalledWith('/agent/agt_1/task/T-1/ship-it', {
      target: 'newTab',
    });
  });

  describe('make a copy', () => {
    const item = () => mocks.dropdownItems.find((entry) => entry?.key === 'makeCopy');
    const source = {
      agentId: 'agt_1',
      description: 'short',
      editorData: { root: {} },
      identifier: 'ENG-1',
      instruction: 'Do the work.',
      labels: [{ id: 'lbl-1', name: 'bug' }],
      name: 'Ship it',
      parent: { identifier: 'ENG-0', name: 'Parent' },
      priority: 2,
      projectId: 'proj-1',
      teamId: 'team-1',
      userId: 'user-2',
      visibility: 'public',
    };

    it('creates a prefilled issue, re-attaches labels and opens it', async () => {
      mocks.taskState.taskDetailMap = { 'T-1': source };
      mocks.createTask.mockResolvedValue({
        assigneeAgentId: 'agt_1',
        identifier: 'ENG-9',
        name: 'Ship it copy',
      });
      render(<TaskDetailHeaderActions />);

      item()?.onClick?.();

      await vi.waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_1/task/ENG-9/ship-it-copy'),
      );
      // Parent, relations, schedule and status stay behind.
      expect(mocks.createTask).toHaveBeenCalledWith({
        assigneeAgentId: 'agt_1',
        assigneeUserId: 'user-2',
        description: 'short',
        editorData: { root: {} },
        instruction: 'Do the work.',
        name: 'taskDetail.menu.copyOfTitle',
        priority: 2,
        projectId: 'proj-1',
        teamId: 'team-1',
        visibility: 'public',
      });
      expect(mocks.toggleTaskLabel).toHaveBeenCalledWith('ENG-9', 'lbl-1', true, source.labels[0]);
      expect(mocks.toastSuccess).toHaveBeenCalledWith('taskList.contextMenu.copySuccess');
    });

    it('still opens the copy when a label fails to attach', async () => {
      mocks.taskState.taskDetailMap = { 'T-1': source };
      mocks.createTask.mockResolvedValue({ identifier: 'ENG-9', name: null });
      mocks.toggleTaskLabel.mockRejectedValue(new Error('nope'));
      render(<TaskDetailHeaderActions />);

      item()?.onClick?.();

      await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/task/ENG-9'));
      expect(mocks.toastWarning).toHaveBeenCalledWith('taskList.contextMenu.copyLabelsFailed');
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
      expect(mocks.toastError).not.toHaveBeenCalled();
    });

    it('reports a failed create and stays on the issue', async () => {
      mocks.taskState.taskDetailMap = { 'T-1': source };
      mocks.createTask.mockRejectedValue(new Error('nope'));
      render(<TaskDetailHeaderActions />);

      item()?.onClick?.();

      await vi.waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith('taskList.contextMenu.copyFailed'),
      );
      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('does nothing when another create is already in flight', async () => {
      mocks.taskState.taskDetailMap = { 'T-1': source };
      mocks.createTask.mockResolvedValue(null);
      render(<TaskDetailHeaderActions />);

      item()?.onClick?.();
      await vi.waitFor(() => expect(mocks.createTask).toHaveBeenCalled());

      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
    });

    it('is disabled without edit permission', () => {
      mocks.permissionAllowed = false;
      render(<TaskDetailHeaderActions />);

      expect(item()?.disabled).toBe(true);
    });
  });

  describe('cancel / reopen', () => {
    const keys = () => mocks.dropdownItems.map((entry) => entry?.key);
    const item = (key: string) => mocks.dropdownItems.find((entry) => entry?.key === key);

    it('cancels an open issue through the shared status command', () => {
      mocks.taskState.taskDetailMap = { 'T-1': { workflowCategory: 'in_progress' } };
      render(<TaskDetailHeaderActions />);

      expect(keys()).not.toContain('reopen');
      item('cancel')?.onClick?.();

      expect(mocks.moveWorkflow).toHaveBeenCalledWith({
        target: { category: 'canceled' },
        taskIdentifier: 'T-1',
      });
    });

    it.each(['canceled', 'done'])('offers Reopen instead of Cancel for a %s issue', (category) => {
      mocks.taskState.taskDetailMap = { 'T-1': { workflowCategory: category } };
      render(<TaskDetailHeaderActions />);

      expect(keys()).not.toContain('cancel');
      item('reopen')?.onClick?.();

      expect(mocks.moveWorkflow).toHaveBeenCalledWith({
        target: { category: 'todo' },
        taskIdentifier: 'T-1',
      });
    });

    it('is disabled without edit permission', () => {
      mocks.permissionAllowed = false;
      render(<TaskDetailHeaderActions />);

      expect(item('cancel')?.disabled).toBe(true);
    });
  });
});
