/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskDetailHeaderActions from './TaskDetailHeaderActions';
import { TaskDetailScope } from './TaskDetailScope';

interface MenuItem {
  children?: MenuItem[];
  disabled?: boolean;
  extra?: ReactNode;
  key?: string;
  label?: ReactNode;
  onClick?: (info?: unknown) => void;
  type?: string;
}

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'ws-1' as string | undefined,
  appNavigate: vi.fn(),
  canEdit: true,
  clearDuplicate: vi.fn(),
  confirmModal: vi.fn(),
  convertToTemplate: vi.fn(),
  copyEverything: vi.fn(),
  copyIssue: vi.fn(),
  createFromTemplate: vi.fn(),
  createModal: vi.fn(),
  deleteTask: vi.fn(),
  dispatch: vi.fn(),
  favoriteIds: [] as Array<string | undefined>,
  hasBranch: false,
  menu: [] as MenuItem[],
  moveTeam: vi.fn(),
  moveWorkflow: vi.fn(),
  navigate: vi.fn(),
  recurrence: null as { enabled: boolean } | null,
  recurrenceRefresh: vi.fn(),
  refresh: vi.fn(),
  refreshList: vi.fn(),
  refreshProjectDetail: vi.fn(),
  refreshProjectList: vi.fn(),
  removeDependency: vi.fn(),
  removeIssueRelation: vi.fn(),
  removeLink: vi.fn(),
  removeRecurrence: vi.fn(),
  resourceRefresh: vi.fn(),
  resources: [] as Array<{ id: string; kind: string; title: string; url: string }>,
  restoreDescription: vi.fn(),
  setMilestone: vi.fn(),
  setRecurrenceEnabled: vi.fn(),
  state: {
    activeTaskId: 'T-1',
    taskDetailMap: {} as Record<string, Record<string, unknown>>,
  },
  swrMutate: vi.fn(),
  toastError: vi.fn(),
  toggleFavorite: vi.fn(),
  transferItems: null as MenuItem[] | null,
  updateTask: vi.fn(),
}));

vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({
    children,
    items,
    onOpenChange,
  }: {
    children: ReactNode;
    items: MenuItem[];
    onOpenChange?: (open: boolean) => void;
  }) => {
    mocks.menu = items;
    return <div onClick={() => onOpenChange?.(true)}>{children}</div>;
  },
}));
vi.mock('@/components/Modal', () => ({
  confirmModal: mocks.confirmModal,
  createModal: mocks.createModal,
  useModalContext: () => ({ close: vi.fn() }),
}));
vi.mock('@/components/toast', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));
vi.mock('@/business/client/hooks/useTaskTransferMenuItem', () => ({
  useTaskTransferMenuItem: () => mocks.transferItems,
}));
vi.mock('@/features/Electron/navigation/appNavigate', () => ({ appNavigate: mocks.appNavigate }));
vi.mock('../features/useIssueStatusMove', () => ({
  useIssueStatusMove: () => mocks.moveWorkflow,
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: mocks.canEdit }) }));
vi.mock('@/features/HomeSidebar/Body/useWorkFavoriteToggle', () => ({
  useWorkFavoriteToggle: (_type: string, id?: string) => {
    mocks.favoriteIds.push(id);
    return { pinned: false, toggle: mocks.toggleFavorite };
  },
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/libs/swr', () => ({
  mutate: vi.fn(),
  useClientDataSWR: (key: unknown[] | null) => ({
    data: {
      data:
        key?.[0] === 'project/teams'
          ? [{ id: 'team-1', name: 'Engineering' }]
          : key?.[0] === 'task:descriptionHistory'
            ? {
                current: { domainRevision: 3, editorData: null, instruction: 'Current contents' },
                versions: [
                  {
                    authorUserId: null,
                    captureSource: 'baseline',
                    createdAt: new Date('2026-10-01'),
                    domainRevision: 2,
                    editorData: null,
                    id: 'history-old',
                    instruction: 'Older contents',
                  },
                ],
              }
            : key?.[0] === 'issue-resources'
              ? mocks.resources
              : key?.[0] === 'task:recurrence'
                ? mocks.recurrence
                : null,
    },
    mutate:
      key?.[0] === 'issue-resources'
        ? mocks.resourceRefresh
        : key?.[0] === 'task:recurrence'
          ? mocks.recurrenceRefresh
          : mocks.swrMutate,
  }),
}));
vi.mock('@/services/taskMenu', () => ({
  taskMenuService: {
    clearDuplicate: mocks.clearDuplicate,
    convertToTemplate: mocks.convertToTemplate,
    copyIssue: mocks.copyIssue,
    createFromTemplate: mocks.createFromTemplate,
    removeLink: mocks.removeLink,
    removeRecurrence: mocks.removeRecurrence,
    restoreDescription: mocks.restoreDescription,
    setRecurrenceEnabled: mocks.setRecurrenceEnabled,
  },
}));
vi.mock('@/store/project', () => ({
  useCurrentProjectList: () => [{ id: 'project-new', name: 'New project' }],
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      refreshProjectDetail: mocks.refreshProjectDetail,
      refreshProjectList: mocks.refreshProjectList,
      setTaskMilestone: mocks.setMilestone,
      useFetchProjectList: () => ({ error: null, isLoading: false, mutate: vi.fn() }),
    }),
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'user-1' } }),
}));
vi.mock('../shared/useActiveTaskProject', () => ({
  useActiveTaskProject: () => ({ milestones: [], taskDatabaseId: 'task-uuid-1' }),
}));
vi.mock('../shared/useUserDisplayMeta', () => ({ useUserDisplayMeta: () => undefined }));
vi.mock('../features/TaskLabelSelector', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../features/AssigneeMemberSelector', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./TaskDetailAssignee', () => ({ default: () => <button>Assign Agent</button> }));
vi.mock('./TaskScheduleConfig', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/services/project', () => ({ projectService: { teams: vi.fn() } }));
vi.mock('@/services/task', () => ({
  taskService: { getReminder: vi.fn(), moveToTeam: mocks.moveTeam, setReminder: vi.fn() },
}));
vi.mock('./createTaskIssueResourceModal', () => ({ openTaskIssueResourceModal: vi.fn() }));
vi.mock('./useTaskCopyActions', () => ({
  useTaskCopyActions: () => ({
    copyBranch: vi.fn(),
    copyEverything: mocks.copyEverything,
    copyId: vi.fn(),
    copyLink: vi.fn(),
    copyMarkdown: vi.fn(),
    copyPrompt: vi.fn(),
    copyTitle: vi.fn(),
    copyTitleAsLink: vi.fn(),
    hasBranch: mocks.hasBranch,
    taskId: mocks.state.activeTaskId,
    taskPath: `/task/${mocks.state.activeTaskId}`,
  }),
}));
vi.mock('@/store/task', () => {
  const state = () => ({
    ...mocks.state,
    deleteTask: mocks.deleteTask,
    internal_dispatchTaskDetail: mocks.dispatch,
    internal_refreshTaskDetail: mocks.refresh,
    refreshTaskList: mocks.refreshList,
    removeDependency: mocks.removeDependency,
    removeIssueRelation: mocks.removeIssueRelation,
    updateTask: mocks.updateTask,
  });
  const useTaskStore = (selector: (value: unknown) => unknown) => selector(state());
  useTaskStore.getState = state;
  return { useTaskStore };
});

const item = (key: string) => mocks.menu.find((entry) => entry?.key === key);
const child = (parent: string, key: string) =>
  item(parent)?.children?.find((entry) => entry?.key === key);
const childKeys = (parent: string) => item(parent)?.children?.map((entry) => entry.key);
const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.actions' }));
const setDetail = (detail: Record<string, unknown>) => {
  mocks.state.taskDetailMap = {
    'T-1': {
      capabilities: { canDelete: true },
      domainRevision: 3,
      id: 'task-uuid-1',
      identifier: 'T-1',
      name: 'Issue',
      ...detail,
    },
  };
};

describe('TaskDetailHeaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.favoriteIds = [];
    mocks.menu = [];
    mocks.resources = [];
    mocks.recurrence = null;
    mocks.transferItems = null;
    mocks.hasBranch = false;
    mocks.activeWorkspaceId = 'ws-1';
    mocks.canEdit = true;
    mocks.state.activeTaskId = 'T-1';
    mocks.updateTask.mockResolvedValue(undefined);
    mocks.moveWorkflow.mockResolvedValue(true);
    mocks.removeDependency.mockResolvedValue(undefined);
    mocks.removeIssueRelation.mockResolvedValue(undefined);
    mocks.copyIssue.mockResolvedValue({ data: { rootId: 'new-copy-id' } });
    mocks.convertToTemplate.mockResolvedValue({ data: { id: 'saved-template' } });
    mocks.createFromTemplate.mockResolvedValue({
      data: { identifier: 'T-NEW', name: 'Issue from template' },
    });
    mocks.restoreDescription.mockResolvedValue({
      data: { domainRevision: 4, editorData: null, instruction: 'Older contents' },
    });
    mocks.dispatch.mockImplementation((payload: { id: string; value: Record<string, unknown> }) =>
      Object.assign(mocks.state.taskDetailMap[payload.id], payload.value),
    );
    setDetail({ dueDate: null, teamId: 'team-old', visibility: 'private' });
  });
  afterEach(cleanup);

  it.each([
    { canDelete: false, writable: true, allowed: false },
    { canDelete: undefined, writable: true, allowed: false },
    { canDelete: true, writable: false, allowed: false },
    { canDelete: true, writable: true, allowed: true },
  ])(
    'requires a writable ceiling and server deletion capability: %j',
    ({ canDelete, writable, allowed }) => {
      mocks.canEdit = writable;
      setDetail({ capabilities: canDelete === undefined ? undefined : { canDelete } });
      render(<TaskDetailHeaderActions />);
      expect(item('delete')?.disabled).toBe(!allowed);
      item('delete')?.onClick?.();
      expect(mocks.confirmModal).toHaveBeenCalledTimes(allowed ? 1 : 0);
    },
  );

  describe('menu shape', () => {
    it('renders the top-level commands in the agreed order', () => {
      mocks.transferItems = [
        { key: 'transfer-task', label: 'Move to…' },
        { key: 'copy-task', label: 'Copy to...' },
      ];
      render(<TaskDetailHeaderActions />);

      expect(mocks.menu.filter(Boolean).map((entry) => entry.key ?? entry.type)).toEqual([
        'openInNewTab',
        'divider',
        'team',
        'propertiesSetup',
        'dueDate',
        'add-link',
        'add-pull_request',
        'add-document',
        'divider',
        'createRelated',
        'markAs',
        'divider',
        'copy',
        'convertTo',
        'makeCopy',
        'divider',
        'favorite',
        'remindMe',
        'divider',
        'transfer-task',
        'copy-task',
        'divider',
        'cancel',
        'divider',
        'descriptionHistory',
        'delete',
      ]);
    });

    it('offers the Team submenu only inside a workspace', () => {
      mocks.activeWorkspaceId = undefined;
      render(<TaskDetailHeaderActions />);

      expect(item('team')).toBeUndefined();
    });

    it('does not offer audience changes as an issue Team command', () => {
      render(<TaskDetailHeaderActions />);

      expect(item('publishToWorkspace')).toBeUndefined();
      expect(item('makePrivate')).toBeUndefined();
    });

    it('lists every create-related, mark-as and convert-to choice', () => {
      render(<TaskDetailHeaderActions />);

      expect(childKeys('createRelated')).toEqual([
        'create-related',
        'create-sub_issue',
        'create-parent',
        'create-blocked',
        'create-blocking',
      ]);
      expect(childKeys('markAs')).toEqual([
        'mark-parentOf',
        'mark-subIssueOf',
        'mark-relatedTo',
        'mark-blockedBy',
        'mark-blocking',
        'mark-duplicateOf',
      ]);
      expect(childKeys('convertTo')).toEqual([
        'convert-project',
        'convert-template',
        'convert-recurring',
      ]);
    });

    it('allows readers to favorite, remind themselves and copy, but disables issue edits', () => {
      mocks.canEdit = false;
      render(<TaskDetailHeaderActions />);

      expect(item('favorite')?.disabled).not.toBe(true);
      expect(item('remindMe')?.disabled).not.toBe(true);
      expect(item('copy')?.disabled).not.toBe(true);
      expect(item('descriptionHistory')?.disabled).not.toBe(true);
      for (const key of [
        'team',
        'propertiesSetup',
        'dueDate',
        'add-link',
        'createRelated',
        'markAs',
        'convertTo',
        'makeCopy',
        'cancel',
        'delete',
      ])
        expect(item(key)?.disabled, key).toBe(true);
      item('propertiesSetup')?.onClick?.();
      item('makeCopy')?.onClick?.();
      expect(mocks.createModal).not.toHaveBeenCalled();
    });

    it('keeps revision-checked commands disabled until the detail carries a revision', () => {
      setDetail({ domainRevision: undefined });
      render(<TaskDetailHeaderActions />);

      expect(item('makeCopy')?.disabled).toBe(true);
      expect(item('convertTo')?.disabled).toBe(true);
      expect(item('markAs')?.disabled).toBe(true);
    });
  });

  describe('copy', () => {
    it('groups the clipboard actions into one Copy submenu', () => {
      render(<TaskDetailHeaderActions />);

      expect(item('copyId')).toBeUndefined();
      expect(item('copyLink')).toBeUndefined();
      expect(childKeys('copy')).toEqual([
        'copyId',
        'copyLink',
        'copyTitle',
        'copyTitleAsLink',
        'copyMarkdown',
        'copyEverything',
        'copyPrompt',
      ]);
    });

    it('adds the branch entry to the Copy submenu only for workspace-bound tasks', () => {
      mocks.hasBranch = true;
      render(<TaskDetailHeaderActions />);

      expect(childKeys('copy')).toContain('copyBranch');
    });

    it('reports a copy that could not read the attached links', async () => {
      mocks.copyEverything.mockRejectedValueOnce(new Error('Links unavailable'));
      render(<TaskDetailHeaderActions />);

      act(() => child('copy', 'copyEverything')?.onClick?.());

      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Links unavailable'));
    });
  });

  it('opens the task route in a new tab through the host navigation adapter', () => {
    render(<TaskDetailHeaderActions />);

    item('openInNewTab')?.onClick?.();

    expect(mocks.appNavigate).toHaveBeenCalledWith('/task/T-1', { target: 'newTab' });
  });

  describe('favorite', () => {
    it('uses the task UUID for the star and the menu Favorite', async () => {
      render(<TaskDetailHeaderActions />);

      expect(mocks.favoriteIds.at(-1)).toBe('task-uuid-1');
      fireEvent.click(screen.getByRole('button', { name: 'taskList.contextMenu.favorite' }));
      item('favorite')?.onClick?.();

      await waitFor(() => expect(mocks.toggleFavorite).toHaveBeenCalledTimes(2));
    });

    it('keeps the header actions bound to the mounted detail scope', () => {
      mocks.state.taskDetailMap['T-2'] = {
        id: 'task-uuid-2',
        identifier: 'T-2',
        visibility: 'public',
      };
      render(
        <TaskDetailScope taskId="T-2">
          <TaskDetailHeaderActions />
        </TaskDetailScope>,
      );

      expect(mocks.favoriteIds.at(-1)).toBe('task-uuid-2');
    });
  });

  describe('properties', () => {
    it('opens Properties for its scoped Issue and persists a project selection through the existing update path', async () => {
      mocks.state.taskDetailMap['T-2'] = {
        ...mocks.state.taskDetailMap['T-1'],
        id: 'task-uuid-2',
        identifier: 'T-2',
      };
      render(
        <TaskDetailScope taskId="T-2">
          <TaskDetailHeaderActions />
        </TaskDetailScope>,
      );
      item('propertiesSetup')?.onClick?.();
      const options = mocks.createModal.mock.calls.at(-1)?.[0] as { content: ReactNode };
      render(<>{options.content}</>);

      expect(screen.getByText('Assign Agent')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'taskDetail.project' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'New project' }));

      await waitFor(() =>
        expect(mocks.updateTask).toHaveBeenCalledWith('T-2', { projectId: 'project-new' }),
      );
      await waitFor(() => expect(mocks.refreshProjectDetail).toHaveBeenCalledWith('project-new'));
      expect(mocks.refreshProjectList).toHaveBeenCalledOnce();
    });

    it('keeps Properties setup open with the write error so a failed value is not presented as saved', async () => {
      mocks.updateTask.mockRejectedValueOnce(new Error('Project forbidden'));
      render(<TaskDetailHeaderActions />);
      item('propertiesSetup')?.onClick?.();
      const options = mocks.createModal.mock.calls.at(-1)?.[0] as { content: ReactNode };
      render(<>{options.content}</>);

      fireEvent.click(screen.getByRole('button', { name: 'taskDetail.project' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'New project' }));

      expect((await screen.findByRole('alert')).textContent).toContain('Project forbidden');
      expect(mocks.refreshProjectList).not.toHaveBeenCalled();
    });
  });

  describe('team', () => {
    const destination = () =>
      item('team')
        ?.children?.flatMap((group) => group.children ?? [])
        .find((entry) => entry.key === 'team-team-1');

    it('moves the issue to the selected team with the observed revision and refreshes it', async () => {
      render(<TaskDetailHeaderActions />);
      openMenu();

      act(() => destination()?.onClick?.());

      await waitFor(() =>
        expect(mocks.moveTeam).toHaveBeenCalledWith({
          expectedDomainRevision: 3,
          taskId: 'task-uuid-1',
          teamId: 'team-1',
        }),
      );
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith('T-1'));
    });

    it('surfaces a failed team move without claiming successful refresh', async () => {
      mocks.moveTeam.mockRejectedValueOnce(new Error('Permission denied'));
      render(<TaskDetailHeaderActions />);
      openMenu();

      act(() => destination()?.onClick?.());

      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('teams.transferFailed'));
      expect(mocks.refresh).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('offers no Remove submenu for an issue with nothing linked', () => {
      render(<TaskDetailHeaderActions />);

      expect(item('remove')).toBeUndefined();
    });

    it('lists the parent, each sub-issue and each relation under Remove', () => {
      setDetail({
        dependencies: [
          { dependsOn: 'ENG-5', id: 'uuid-5', type: 'blocks' },
          { dependsOn: 'ENG-6', direction: 'blocking', type: 'blocks' },
          { dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' },
          { dependsOn: 'ENG-8', type: 'duplicates' },
        ],
        parent: { identifier: 'ENG-1', name: 'Parent' },
        subtasks: [{ identifier: 'ENG-2', status: 'backlog' }],
      });
      render(<TaskDetailHeaderActions />);

      expect(
        item('remove')?.children?.map((entry) => [entry.key, entry.label, entry.extra]),
      ).toEqual([
        ['remove-parent', 'taskDetail.menu.removeParent', 'ENG-1'],
        ['remove-sub-issue-ENG-2', 'taskDetail.menu.removeSubIssue', 'ENG-2'],
        ['remove-relation-blockedBy-ENG-5', 'taskDetail.menu.removeBlocking', 'ENG-5'],
        ['remove-relation-blocking-ENG-6', 'taskDetail.menu.removeBlocked', 'ENG-6'],
        ['remove-relation-rel-7', 'taskDetail.menu.removeRelated', 'ENG-7'],
      ]);
    });

    it('detaches the parent and a sub-issue by clearing the child side of the edge', () => {
      setDetail({
        parent: { identifier: 'ENG-1', name: 'Parent' },
        subtasks: [{ identifier: 'ENG-2', status: 'backlog' }],
      });
      render(<TaskDetailHeaderActions />);

      child('remove', 'remove-parent')?.onClick?.();
      expect(mocks.updateTask).toHaveBeenLastCalledWith('T-1', { parentTaskId: null });

      child('remove', 'remove-sub-issue-ENG-2')?.onClick?.();
      expect(mocks.updateTask).toHaveBeenLastCalledWith('ENG-2', { parentTaskId: null });
    });

    it('unlinks each relation from the side that owns the edge', () => {
      setDetail({
        dependencies: [
          { dependsOn: 'ENG-5', id: 'uuid-5', type: 'blocks' },
          { dependsOn: 'ENG-6', direction: 'blocking', type: 'blocks' },
          { dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' },
          { dependsOn: 'ENG-9', type: 'relates' },
        ],
      });
      render(<TaskDetailHeaderActions />);

      for (const entry of item('remove')?.children ?? []) entry.onClick?.();

      expect(mocks.removeDependency.mock.calls).toEqual([
        ['T-1', 'uuid-5', 'blocks'],
        ['ENG-6', 'T-1', 'blocks'],
        ['T-1', 'ENG-9', 'relates'],
      ]);
      expect(mocks.removeIssueRelation.mock.calls).toEqual([['T-1', 'rel-7']]);
    });

    it('reports a relation that could not be removed', async () => {
      mocks.removeIssueRelation.mockRejectedValue(new Error('nope'));
      setDetail({ dependencies: [{ dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' }] });
      render(<TaskDetailHeaderActions />);

      item('remove')?.children?.[0].onClick?.();

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith('taskDetail.menu.removeFailed'),
      );
    });

    it('disables every Remove entry without edit permission', () => {
      mocks.canEdit = false;
      mocks.resources = [
        { id: 'resource-1', kind: 'link', title: 'Saved link', url: 'https://example.test' },
      ];
      setDetail({
        dependencies: [{ dependsOn: 'ENG-7', relationId: 'rel-7', type: 'relates' }],
        duplicateOf: { identifier: 'T-canonical' },
        parent: { identifier: 'ENG-1', name: 'Parent' },
      });
      render(<TaskDetailHeaderActions />);
      openMenu();

      expect(item('remove')?.children?.map((entry) => entry.disabled)).toEqual([
        true,
        true,
        true,
        true,
      ]);
    });

    it('revalidates the mounted attachment list after removing a link through the header', async () => {
      mocks.resources = [
        { id: 'resource-1', kind: 'link', title: 'Saved link', url: 'https://example.test' },
      ];
      render(<TaskDetailHeaderActions />);
      openMenu();

      act(() => child('remove', 'remove-link-resource-1')?.onClick?.());

      await waitFor(() =>
        expect(mocks.removeLink).toHaveBeenCalledWith('task-uuid-1', 'resource-1'),
      );
      await waitFor(() => expect(mocks.resourceRefresh).toHaveBeenCalledTimes(1));
    });

    it('shows the canonical duplicate relationship and clears only that relationship', async () => {
      setDetail({ duplicateOf: { identifier: 'T-canonical', name: 'Canonical issue' } });
      render(<TaskDetailHeaderActions />);

      expect(child('remove', 'remove-duplicate')?.extra).toBe('T-canonical');
      expect(child('markAs', 'mark-duplicateOf')?.extra).toBe('T-canonical');
      act(() => child('remove', 'remove-duplicate')?.onClick?.());

      await waitFor(() =>
        expect(mocks.clearDuplicate).toHaveBeenCalledWith({
          expectedDomainRevision: 3,
          id: 'task-uuid-1',
        }),
      );
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith('T-1'));
    });

    it('names an unreadable duplicate target as unavailable instead of leaking it', () => {
      setDetail({ duplicateOf: { unavailable: true } });
      render(<TaskDetailHeaderActions />);

      expect(child('remove', 'remove-duplicate')?.extra).toBe('taskDetail.menu.unavailable');
    });

    it('pauses, resumes and removes a recurrence only when the issue has one', async () => {
      mocks.recurrence = { enabled: true };
      const { unmount } = render(<TaskDetailHeaderActions />);
      openMenu();

      expect(child('remove', 'toggle-recurrence')?.label).toBe('taskDetail.menu.pauseRecurrence');
      act(() => child('remove', 'toggle-recurrence')?.onClick?.());
      await waitFor(() =>
        expect(mocks.setRecurrenceEnabled).toHaveBeenCalledWith({
          enabled: false,
          id: 'task-uuid-1',
        }),
      );
      await waitFor(() => expect(mocks.recurrenceRefresh).toHaveBeenCalled());
      unmount();

      mocks.recurrence = { enabled: false };
      render(<TaskDetailHeaderActions />);
      openMenu();
      expect(child('remove', 'toggle-recurrence')?.label).toBe('taskDetail.menu.resumeRecurrence');
      act(() => child('remove', 'remove-recurrence')?.onClick?.());
      await waitFor(() => expect(mocks.removeRecurrence).toHaveBeenCalledWith('task-uuid-1'));
    });
  });

  describe('definitions', () => {
    it('submits Make a copy with an unassigned default and opens the persisted issue', async () => {
      render(<TaskDetailHeaderActions />);
      item('makeCopy')?.onClick?.();
      render(mocks.createModal.mock.calls[0][0].content);

      fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.submit.copy' }));

      await waitFor(() =>
        expect(mocks.copyIssue).toHaveBeenCalledWith(
          expect.objectContaining({
            copyAssignees: false,
            expectedDomainRevision: 3,
            id: 'task-uuid-1',
          }),
        ),
      );
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/task/new-copy-id'));
    });

    it('opens an already-created copy even when its list refresh fails', async () => {
      mocks.refresh.mockRejectedValueOnce(new Error('Readback unavailable'));
      render(<TaskDetailHeaderActions />);
      item('makeCopy')?.onClick?.();
      render(mocks.createModal.mock.calls[0][0].content);

      fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.submit.copy' }));

      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/task/new-copy-id'));
      expect(mocks.copyIssue).toHaveBeenCalledTimes(1);
      expect(mocks.toastError).toHaveBeenCalledWith('Readback unavailable');
    });

    it('keeps the copy form open with the server error when the copy is rejected', async () => {
      mocks.copyIssue.mockRejectedValueOnce(new Error('Task revision conflict'));
      render(<TaskDetailHeaderActions />);
      item('makeCopy')?.onClick?.();
      render(mocks.createModal.mock.calls[0][0].content);

      fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.submit.copy' }));

      expect((await screen.findByRole('alert')).textContent).toContain('Task revision conflict');
      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('saves a template and exposes the real create-from-template action', async () => {
      render(<TaskDetailHeaderActions />);
      child('convertTo', 'convert-template')?.onClick?.();
      render(mocks.createModal.mock.calls[0][0].content);

      fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.submit.template' }));
      await waitFor(() =>
        expect(mocks.convertToTemplate).toHaveBeenCalledWith({
          expectedDomainRevision: 3,
          id: 'task-uuid-1',
          name: 'Issue',
        }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'taskDetail.menu.createFromTemplate' }),
      );

      await waitFor(() =>
        expect(mocks.createFromTemplate).toHaveBeenCalledWith({
          name: 'Issue',
          templateId: 'saved-template',
        }),
      );
      await waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledWith('/task/T-NEW/issue-from-template'),
      );
    });
  });

  it('restores a historical description and applies the authoritative snapshot to its host', async () => {
    render(<TaskDetailHeaderActions />);
    item('descriptionHistory')?.onClick?.();
    render(mocks.createModal.mock.calls[0][0].content);

    const restore = screen.getByRole('button', { name: 'taskDetail.menu.restoreVersion' });
    expect((restore as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.previousChange' }));
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.restoreVersion' }));

    await waitFor(() =>
      expect(mocks.restoreDescription).toHaveBeenCalledWith({
        expectedDomainRevision: 3,
        historyId: 'history-old',
        id: 'task-uuid-1',
      }),
    );
    await waitFor(() =>
      expect(mocks.state.taskDetailMap['T-1'].instruction).toBe('Older contents'),
    );
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'T-1' }), {
      instructionSource: 'external',
    });
  });

  it('preserves the delete confirmation and navigates after the mutation succeeds', async () => {
    render(<TaskDetailHeaderActions />);

    item('delete')?.onClick?.();

    expect(mocks.confirmModal).toHaveBeenCalledTimes(1);
    await mocks.confirmModal.mock.calls[0][0].onOk();
    expect(mocks.deleteTask).toHaveBeenCalledWith('T-1');
    expect(mocks.navigate).toHaveBeenCalledWith('/tasks');
  });

  describe('cancel / reopen', () => {
    it('cancels an open issue through the shared status command', () => {
      setDetail({ workflowCategory: 'in_progress' });
      render(<TaskDetailHeaderActions />);

      expect(item('reopen')).toBeUndefined();
      item('cancel')?.onClick?.();

      expect(mocks.moveWorkflow).toHaveBeenCalledWith({
        target: { category: 'canceled' },
        taskIdentifier: 'T-1',
      });
    });

    it.each(['canceled', 'done'])('offers Reopen instead of Cancel for a %s issue', (category) => {
      setDetail({ workflowCategory: category });
      render(<TaskDetailHeaderActions />);

      expect(item('cancel')).toBeUndefined();
      item('reopen')?.onClick?.();

      expect(mocks.moveWorkflow).toHaveBeenCalledWith({
        target: { category: 'todo' },
        taskIdentifier: 'T-1',
      });
    });
  });
});
