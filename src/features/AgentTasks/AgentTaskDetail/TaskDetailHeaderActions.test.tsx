/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';

import TaskDetailHeaderActions from './TaskDetailHeaderActions';
import { TaskDetailScope } from './TaskDetailScope';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'ws-1' as string | undefined,
  canEdit: true,
  confirmModal: vi.fn(),
  createModal: vi.fn(),
  copyIssue: vi.fn(),
  convertToTemplate: vi.fn(),
  createFromTemplate: vi.fn(),
  restoreDescription: vi.fn(),
  dispatch: vi.fn(),
  updateTask: vi.fn(),
  refreshProjectDetail: vi.fn(),
  refreshProjectList: vi.fn(),
  setMilestone: vi.fn(),
  swrMutate: vi.fn(),
  resourceRefresh: vi.fn(),
  removeLink: vi.fn(),
  clearDuplicate: vi.fn(),
  resources: [] as Array<{ id: string; title: string; url: string; kind: string }>,
  deleteTask: vi.fn(),
  favoriteIds: [] as Array<string | undefined>,
  menu: [] as SidebarMenuItemData[],
  moveTeam: vi.fn(),
  navigate: vi.fn(),
  refresh: vi.fn(),
  refreshList: vi.fn(),
  schedule: vi.fn(),
  state: {
    activeTaskId: 'T-1',
    taskDetailMap: {} as Record<string, Record<string, unknown>>,
  },
  toggleFavorite: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({
    children,
    items,
    onOpenChange,
  }: {
    children: ReactNode;
    items: SidebarMenuItemData[];
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
  useClientDataSWR: (key: unknown[]) => ({
    mutate: key?.[0] === 'issue-resources' ? mocks.resourceRefresh : mocks.swrMutate,
    data: {
      data:
        key?.[0] === 'project/teams'
          ? [{ id: 'team-1', name: 'Engineering' }]
          : key?.[0] === 'task:descriptionHistory'
            ? {
                current: { instruction: 'Current contents', editorData: null, domainRevision: 3 },
                versions: [
                  {
                    id: 'history-old',
                    instruction: 'Older contents',
                    editorData: null,
                    domainRevision: 2,
                    createdAt: new Date('2026-10-01'),
                    authorUserId: null,
                    captureSource: 'baseline',
                  },
                ],
              }
            : key?.[0] === 'task:resources' || key?.[0] === 'issue-resources'
              ? mocks.resources
              : null,
    },
  }),
}));
vi.mock('@/services/taskMenu', () => ({
  taskMenuService: {
    removeLink: mocks.removeLink,
    clearDuplicate: mocks.clearDuplicate,
    copyIssue: mocks.copyIssue,
    convertToTemplate: mocks.convertToTemplate,
    createFromTemplate: mocks.createFromTemplate,
    restoreDescription: mocks.restoreDescription,
  },
}));
vi.mock('@/store/project', () => ({
  useCurrentProjectList: () => [{ id: 'project-new', name: 'New project' }],
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      useFetchProjectList: () => ({ isLoading: false, error: null, mutate: vi.fn() }),
      refreshProjectDetail: mocks.refreshProjectDetail,
      refreshProjectList: mocks.refreshProjectList,
      setTaskMilestone: mocks.setMilestone,
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
  taskService: { moveToTeam: mocks.moveTeam, getReminder: vi.fn(), setReminder: vi.fn() },
}));
vi.mock('./createTaskIssueResourceModal', () => ({ openTaskIssueResourceModal: vi.fn() }));
vi.mock('../features/TaskScheduleDialog', () => ({ openTaskScheduleDialog: mocks.schedule }));
vi.mock('./useTaskCopyActions', () => ({
  useTaskCopyActions: () => ({
    copyEverything: vi.fn(),
    copyMarkdown: vi.fn(),
    copyPrompt: vi.fn(),
    copyTitle: vi.fn(),
    copyTitleAsLink: vi.fn(),
    copyBranch: vi.fn(),
    copyId: vi.fn(),
    copyLink: vi.fn(),
    hasBranch: false,
    taskId: mocks.state.activeTaskId,
  }),
}));
vi.mock('@/store/task', () => {
  const state = () => ({
    ...mocks.state,
    deleteTask: mocks.deleteTask,
    internal_refreshTaskDetail: mocks.refresh,
    refreshTaskList: mocks.refreshList,
    updateTask: mocks.updateTask,
    internal_dispatchTaskDetail: mocks.dispatch,
  });
  const useTaskStore = (selector: (value: unknown) => unknown) => selector(state());
  useTaskStore.getState = state;
  return { useTaskStore };
});

const item = (key: string) => mocks.menu.find((entry) => entry?.key === key);
const invoke = (key: string) =>
  item(key)?.onClick?.({
    domEvent: { stopPropagation: vi.fn() },
    item: document.body,
    key,
    keyPath: [key],
  } as never);

describe('TaskDetailHeaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.favoriteIds = [];
    mocks.menu = [];
    mocks.resources = [];
    mocks.updateTask.mockResolvedValue(undefined);
    mocks.copyIssue.mockResolvedValue({ data: { rootId: 'new-copy-id' } });
    mocks.convertToTemplate.mockResolvedValue({ data: { id: 'saved-template' } });
    mocks.createFromTemplate.mockResolvedValue({
      data: { identifier: 'T-NEW', name: 'Issue from template' },
    });
    mocks.restoreDescription.mockResolvedValue({
      data: { instruction: 'Older contents', editorData: null, domainRevision: 4 },
    });
    mocks.dispatch.mockImplementation((payload: { id: string; value: Record<string, unknown> }) =>
      Object.assign(mocks.state.taskDetailMap[payload.id], payload.value),
    );
    mocks.activeWorkspaceId = 'ws-1';
    mocks.canEdit = true;
    mocks.state.activeTaskId = 'T-1';
    mocks.state.taskDetailMap = {
      'T-1': {
        id: 'task-uuid-1',
        identifier: 'T-1',
        name: 'Issue',
        visibility: 'private',
        dueDate: null,
        domainRevision: 3,
        teamId: 'team-old',
      },
    };
  });
  afterEach(cleanup);

  it('groups clipboard commands under Copy and removes flat duplicate entries', () => {
    render(<TaskDetailHeaderActions />);
    expect(item('copyId')).toBeUndefined();
    expect(item('copyLink')).toBeUndefined();
    expect(item('copy')?.children?.map((child) => child?.key)).toContain('copyId');
    expect(item('copy')?.children?.map((child) => child?.key)).toContain('copyLink');
  });

  it('renders the captured executable top-level commands in order', () => {
    render(<TaskDetailHeaderActions />);
    expect(mocks.menu.filter((entry) => entry?.key).map((entry) => entry.key)).toEqual([
      'team',
      'propertiesSetup',
      'dueDate',
      'add-link',
      'add-pull_request',
      'add-document',
      'createRelated',
      'markAs',
      'remove',
      'copy',
      'convertTo',
      'makeCopy',
      'favorite',
      'remindMe',
      'descriptionHistory',
      'delete',
    ]);
  });

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
    invoke('propertiesSetup');
    const options = mocks.createModal.mock.calls.at(-1)?.[0] as { content: ReactNode };
    expect(options.content).toBeTruthy();
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
    invoke('propertiesSetup');
    const options = mocks.createModal.mock.calls.at(-1)?.[0] as { content: ReactNode };
    render(<>{options.content}</>);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.project' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Project forbidden');
    expect(screen.getByRole('button', { name: 'taskDetail.project' })).toBeVisible();
    expect(mocks.refreshProjectList).not.toHaveBeenCalled();
  });

  it('does not offer audience changes as an issue Team command', () => {
    render(<TaskDetailHeaderActions />);
    expect(item('publishToWorkspace')).toBeUndefined();
    expect(item('makePrivate')).toBeUndefined();
  });

  it('uses the task UUID for the star and menu Favorite', async () => {
    render(<TaskDetailHeaderActions />);
    expect(mocks.favoriteIds.at(-1)).toBe('task-uuid-1');
    fireEvent.click(screen.getByRole('button', { name: 'taskList.contextMenu.favorite' }));
    invoke('favorite');
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

  it('preserves the delete confirmation and navigates after the mutation succeeds', async () => {
    render(<TaskDetailHeaderActions />);
    invoke('delete');
    expect(mocks.confirmModal).toHaveBeenCalledTimes(1);
    await mocks.confirmModal.mock.calls[0][0].onOk();
    expect(mocks.deleteTask).toHaveBeenCalledWith('T-1');
    expect(mocks.navigate).toHaveBeenCalledWith('/tasks');
  });

  it('moves the issue to the selected team with the observed revision and refreshes it', async () => {
    render(<TaskDetailHeaderActions />);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.actions' }));
    const destination = item('team')
      ?.children?.flatMap((group) => (group && 'children' in group ? (group.children ?? []) : []))
      .find((child) => child?.key === 'team-team-1');
    if (destination && 'onClick' in destination)
      destination.onClick?.({ domEvent: { stopPropagation: vi.fn() } } as never);
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
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.actions' }));
    const destination = item('team')
      ?.children?.flatMap((group) => (group && 'children' in group ? (group.children ?? []) : []))
      .find((child) => child?.key === 'team-team-1');
    if (destination && 'onClick' in destination)
      destination.onClick?.({ domEvent: { stopPropagation: vi.fn() } } as never);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('teams.transferFailed'));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('revalidates the mounted attachment list after removing a link through the header', async () => {
    mocks.resources = [
      { id: 'resource-1', title: 'Saved link', url: 'https://example.test', kind: 'link' },
    ];
    render(<TaskDetailHeaderActions />);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.actions' }));
    const entry = item('remove')?.children?.find(
      (child) => child?.key === 'remove-link-resource-1',
    );
    act(() => {
      if (entry && 'onClick' in entry) entry.onClick?.({} as never);
    });
    await waitFor(() => expect(mocks.removeLink).toHaveBeenCalledWith('task-uuid-1', 'resource-1'));
    await waitFor(() => expect(mocks.resourceRefresh).toHaveBeenCalledTimes(1));
  });

  it('shows the canonical duplicate relationship and clears only that relationship', async () => {
    mocks.state.taskDetailMap['T-1'].duplicateOf = {
      identifier: 'T-canonical',
      name: 'Canonical issue',
    };
    render(<TaskDetailHeaderActions />);
    const entry = item('remove')?.children?.find((child) => child?.key === 'remove-duplicate');
    expect(entry && 'extra' in entry ? entry.extra : undefined).toBe('T-canonical');
    act(() => {
      if (entry && 'onClick' in entry) entry.onClick?.({} as never);
    });
    await waitFor(() =>
      expect(mocks.clearDuplicate).toHaveBeenCalledWith({
        id: 'task-uuid-1',
        expectedDomainRevision: 3,
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith('T-1'));
  });

  it('submits Make a copy with an unassigned default and opens the persisted issue', async () => {
    render(<TaskDetailHeaderActions />);
    invoke('makeCopy');
    render(mocks.createModal.mock.calls[0][0].content);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.submit.copy' }));
    await waitFor(() =>
      expect(mocks.copyIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-uuid-1',
          expectedDomainRevision: 3,
          copyAssignees: false,
        }),
      ),
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/task/new-copy-id'));
  });

  it('opens an already-created copy even when its list refresh fails', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('Readback unavailable'));
    render(<TaskDetailHeaderActions />);
    invoke('makeCopy');
    render(mocks.createModal.mock.calls[0][0].content);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.submit.copy' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/task/new-copy-id'));
    expect(mocks.copyIssue).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith('Readback unavailable');
  });

  it('saves a template and exposes the real create-from-template action', async () => {
    render(<TaskDetailHeaderActions />);
    const template = item('convertTo')?.children?.find(
      (entry) => entry?.key === 'convert-template',
    );
    if (template && 'onClick' in template) template.onClick?.({} as never);
    render(mocks.createModal.mock.calls[0][0].content);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.submit.template' }));
    await waitFor(() =>
      expect(mocks.convertToTemplate).toHaveBeenCalledWith({
        id: 'task-uuid-1',
        expectedDomainRevision: 3,
        name: 'Issue',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'taskDetail.menu.createFromTemplate' }),
    );
    await waitFor(() =>
      expect(mocks.createFromTemplate).toHaveBeenCalledWith({
        templateId: 'saved-template',
        name: 'Issue',
      }),
    );
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/task/T-NEW/issue-from-template'),
    );
  });

  it('restores a historical description and applies the authoritative snapshot to its host', async () => {
    render(<TaskDetailHeaderActions />);
    invoke('descriptionHistory');
    render(mocks.createModal.mock.calls[0][0].content);
    expect(screen.getByRole('button', { name: 'taskDetail.menu.restoreVersion' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.previousChange' }));
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.restoreVersion' }));
    await waitFor(() =>
      expect(mocks.restoreDescription).toHaveBeenCalledWith({
        id: 'task-uuid-1',
        historyId: 'history-old',
        expectedDomainRevision: 3,
      }),
    );
    await waitFor(() =>
      expect(mocks.state.taskDetailMap['T-1'].instruction).toBe('Older contents'),
    );
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'T-1' }), {
      instructionSource: 'external',
    });
  });

  it('allows readers to favorite and remind themselves but disables task editing', () => {
    mocks.canEdit = false;
    render(<TaskDetailHeaderActions />);
    expect(item('favorite')?.disabled).not.toBe(true);
    expect(item('remindMe')?.disabled).not.toBe(true);
    expect(item('delete')?.disabled).toBe(true);
    expect(item('dueDate')?.disabled).toBe(true);
    expect(item('propertiesSetup')?.disabled).toBe(true);
    invoke('propertiesSetup');
    expect(mocks.createModal).not.toHaveBeenCalled();
  });
});
