/**
 * @vitest-environment happy-dom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModalHost } from '@/components/Modal';
import { canGoNative } from '@/libs/contextMenu/canGoNative';

import { useAssigneeMenuItems } from './assigneeMenuItems';
import { useTaskItemContextMenu } from './useTaskItemContextMenu';

const memberDirectoryMock = vi.hoisted(() => ({
  role: 'member',
  workspaceId: 'workspace-1' as string | undefined,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useActiveWorkspaceId: () => memberDirectoryMock.workspaceId,
}));

vi.mock('@/business/client/hooks/useFetchWorkspaceMembers', () => ({
  useFetchWorkspaceMembers: () => ({ isLoading: false }),
}));

vi.mock('@/business/client/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => [
    { role: 'member', userId: 'creator-1' },
    { role: 'member', userId: 'member-2' },
    { role: 'viewer', userId: 'viewer-3' },
  ],
}));

vi.mock('@/business/client/hooks/useFetchWorkspaces', () => ({
  useFetchWorkspaces: () => ({
    data: [{ id: memberDirectoryMock.workspaceId, role: memberDirectoryMock.role }],
    isLoading: false,
  }),
}));

const mocks = vi.hoisted(() => ({
  closeContextMenu: vi.fn(),
  copyToClipboard: vi.fn(),
  deleteTask: vi.fn(),
  messageSuccess: vi.fn(),
  modalConfirm: vi.fn(),
  getReminder: vi.fn(),
  moveWorkflow: vi.fn(),
  refreshTaskList: vi.fn(),
  setReminder: vi.fn(),
  toastError: vi.fn(),
  runTask: vi.fn(),
  transferItems: [
    { key: 'transfer-task', label: 'Move to…' },
    { key: 'copy-task', label: 'Copy to...' },
  ],
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

vi.mock('@/libs/contextMenu', () => ({
  closeContextMenu: mocks.closeContextMenu,
}));

vi.mock('@/services/task', () => ({
  taskService: {
    getReminder: mocks.getReminder,
    setReminder: mocks.setReminder,
  },
}));

vi.mock('@/components/toast', async (importOriginal) => {
  const original = await importOriginal<{ toast: Record<string, unknown> }>();
  return { ...original, toast: { ...original.toast, error: mocks.toastError } };
});

vi.mock('@/components/ui/calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  App: {
    useApp: () => ({
      message: { success: mocks.messageSuccess },
      modal: { confirm: mocks.modalConfirm },
    }),
  },
}));

vi.mock('@/business/client/hooks/useTaskTransferMenuItem', () => ({
  useTaskTransferMenuItem: () => mocks.transferItems,
}));

vi.mock('./useIssueStatusMove', () => ({
  useIssueStatusMove: () => mocks.moveWorkflow,
}));

vi.mock('@/hooks/useAppOrigin', () => ({
  useAppOrigin: () => 'https://example.com',
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: { inboxAgentId: string }) => unknown) =>
    selector({ inboxAgentId: 'inbox-agent' }),
}));

vi.mock('@/store/agent/selectors', () => ({
  builtinAgentSelectors: {
    inboxAgentId: (state: { inboxAgentId: string }) => state.inboxAgentId,
  },
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (
    selector: (state: {
      deleteTask: typeof mocks.deleteTask;
      refreshTaskList: typeof mocks.refreshTaskList;
      runTask: typeof mocks.runTask;
      updateTask: typeof mocks.updateTask;
      updateTaskStatus: typeof mocks.updateTaskStatus;
    }) => unknown,
  ) =>
    selector({
      deleteTask: mocks.deleteTask,
      refreshTaskList: mocks.refreshTaskList,
      runTask: mocks.runTask,
      updateTask: mocks.updateTask,
      updateTaskStatus: mocks.updateTaskStatus,
    }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: { defaultValue?: ReactNode; ns?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

describe('task member privacy compatibility', () => {
  it('offers every assignable workspace member for a legacy private task', () => {
    memberDirectoryMock.workspaceId = 'workspace-1';
    const { result } = renderHook(() =>
      useAssigneeMenuItems(undefined, vi.fn(), { creatorId: 'creator-1', visibility: 'private' }),
    );

    expect(result.current.map((item) => (item && 'key' in item ? item.key : undefined))).toEqual([
      'assignee:unassigned',
      'assignee:creator-1',
      'assignee:member-2',
    ]);
  });

  it('offers no workspace members in personal scope', () => {
    memberDirectoryMock.workspaceId = undefined;
    const { result } = renderHook(() =>
      useAssigneeMenuItems(undefined, vi.fn(), { visibility: 'private' }),
    );

    expect(result.current.map((item) => (item && 'key' in item ? item.key : undefined))).toEqual([
      'assignee:unassigned',
    ]);
    memberDirectoryMock.workspaceId = 'workspace-1';
  });
});

describe('useTaskItemContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberDirectoryMock.role = 'member';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.copyToClipboard },
    });
  });

  it('does not render adjacent dividers around transfer actions', () => {
    const { result } = renderHook(() =>
      useTaskItemContextMenu({
        identifier: 'T-1',
        priority: 0,
        status: 'backlog',
      }),
    );

    const itemTypes = result.current.items.map((item) =>
      item && typeof item === 'object' && 'type' in item ? item.type : 'item',
    );

    expect(
      itemTypes.some((type, index) => type === 'divider' && itemTypes[index + 1] === 'divider'),
    ).toBe(false);
  });

  it('copies the global task detail link in global route scope', async () => {
    const { result } = renderHook(() =>
      useTaskItemContextMenu(
        {
          assigneeAgentId: 'agent-1',
          identifier: 'T-1',
          priority: 0,
          status: 'backlog',
        },
        'global',
      ),
    );

    // Linear nests the clipboard actions under one `Copy` submenu.
    const copyMenu = result.current.items.find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'copy',
    ) as { children: { key: string; onClick: (info: unknown) => Promise<void> }[] };
    const copyLinkItem = copyMenu.children.find((item) => item.key === 'copyLink');

    if (!copyLinkItem) throw new Error('Expected a Copy link menu item');
    await copyLinkItem.onClick({
      domEvent: { stopPropagation: vi.fn() },
    });

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('https://example.com/task/T-1');
  });

  it('does not offer a manual run that would skip the workflow status', async () => {
    const { result } = renderHook(() =>
      useTaskItemContextMenu({
        assigneeUserId: 'user-1',
        identifier: 'T-1',
        priority: 0,
        status: 'backlog',
      }),
    );

    const runNowItem = result.current.items.find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'runNow',
    );

    expect(runNowItem).toBeUndefined();
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('routes the keyboard-shortcut submenu selection through @/libs/contextMenu', () => {
    const { result } = renderHook(() =>
      useTaskItemContextMenu({
        identifier: 'T-1',
        priority: 0,
        status: 'backlog',
      }),
    );

    act(() => {
      result.current.onContextMenu();
    });

    const statusItem = result.current.items.find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'status',
    ) as { onTitleMouseEnter?: () => void };

    act(() => {
      statusItem.onTitleMouseEnter?.();
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });

    expect(mocks.closeContextMenu).toHaveBeenCalledTimes(1);
  });

  it('keeps Viewer workflow items and keyboard shortcuts denied', async () => {
    memberDirectoryMock.role = 'viewer';
    const { result } = renderHook(() =>
      useTaskItemContextMenu({ identifier: 'T-1', priority: 0, status: 'backlog' }),
    );
    const statusItem = result.current.items.find(
      (item) => item && 'key' in item && item.key === 'status',
    ) as {
      children: Array<{ disabled?: boolean; onClick: (info: unknown) => void }>;
      onTitleMouseEnter?: () => void;
    };
    expect(statusItem.children.every((child) => child.disabled)).toBe(true);
    await act(async () => {
      result.current.onContextMenu();
      statusItem.onTitleMouseEnter?.();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
      await statusItem.children[0].onClick({ domEvent: { stopPropagation: vi.fn() } });
    });
    expect(mocks.closeContextMenu).not.toHaveBeenCalled();
    expect(mocks.moveWorkflow).not.toHaveBeenCalled();
  });

  it('offers the seven workflow columns in order — execution states are never picks', () => {
    const { result } = renderHook(() =>
      useTaskItemContextMenu({
        identifier: 'T-1',
        priority: 0,
        status: 'backlog',
      }),
    );

    const statusItem = result.current.items.find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'status',
    ) as { children: Array<{ disabled?: boolean; key: string; label?: string }> };
    const children = statusItem.children;

    // The Issue board's columns, 1:1 — triage leads; no running/needsInput
    // execution folds and no `st:` keys remain in the Issue status menu.
    expect(children.map((child) => child.key)).toEqual([
      'status-triage',
      'status-backlog',
      'status-todo',
      'status-in_progress',
      'status-in_review',
      'status-done',
      'status-canceled',
    ]);
    expect(children[0].label).toBe('taskList.kanban.triage');
    // Every row is a workflow move — a category write goes through the same
    // CAS command a board drop commits, linked or not.
    expect(children.every((child) => !child.disabled)).toBe(true);
  });

  it('lets a workflow-linked task pick triage — written as workflowCategory', async () => {
    const { result } = renderHook(() =>
      useTaskItemContextMenu({
        identifier: 'T-1',
        priority: 0,
        status: 'backlog',
        workflowCategory: 'backlog',
        workflowStateId: 'ls-1',
      }),
    );

    const statusItem = result.current.items.find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'status',
    ) as {
      children: Array<{ disabled?: boolean; key: string; onClick: (info: unknown) => void }>;
    };
    expect(statusItem.children.every((child) => !child.disabled)).toBe(true);

    const triage = statusItem.children.find((child) => child.key === 'status-triage');
    await triage?.onClick({ domEvent: { stopPropagation: vi.fn() } });

    // A workflow pick commits through the shared Issue status command — the
    // same CAS move the detail/list tags and the boards write — never a raw
    // category patch.
    expect(mocks.moveWorkflow).toHaveBeenCalledWith({
      taskIdentifier: 'T-1',
      target: { category: 'triage', workflowStateRefId: undefined },
    });
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
});

describe('menu ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('must stay web because the status/priority submenus depend on number-shortcut extra badges', () => {
    const { result } = renderHook(() =>
      useTaskItemContextMenu({
        identifier: 'T-1',
        priority: 0,
        status: 'backlog',
      }),
    );

    expect(canGoNative(result.current.items)).toBe(false);
    expect({
      menu: 'AgentTasks/taskItem',
      native: canGoNative(result.current.items),
    }).toMatchSnapshot();
  });
});

describe('schedule dialog error feedback', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Opens the real dialog through the public path — the context-menu item
  // calls openTaskScheduleDialog → createModal → the mounted ModalHost.
  const openScheduleDialog = async () => {
    render(<ModalHost />);
    const { result } = renderHook(() =>
      useTaskItemContextMenu({ identifier: 'T-1', priority: 0, status: 'backlog' }),
    );
    const remindMeItem = result.current.items.find(
      (item) => item && typeof item === 'object' && 'key' in item && item.key === 'remindMe',
    ) as { onClick: (info: unknown) => void } | undefined;

    if (!remindMeItem) throw new Error('Expected a Remind me menu item');
    await act(async () => {
      remindMeItem.onClick({ domEvent: { stopPropagation: vi.fn() } });
    });
  };

  it('toasts when the reminder load fails and still unlocks the preset rows', async () => {
    mocks.getReminder.mockRejectedValue(new Error('offline'));

    await openScheduleDialog();

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('taskList.schedule.loadFailed'),
    );
    // reminderLoaded still resolves — the rows must not stay disabled forever.
    await waitFor(() => expect(screen.getByRole('button', { name: 'hour' })).not.toBeDisabled());
  });

  it('toasts on a failed due-date save and keeps the dialog interactive for retry', async () => {
    mocks.getReminder.mockResolvedValue({ data: { remindAt: null } });
    mocks.updateTask.mockRejectedValue(new Error('conflict'));

    await openScheduleDialog();
    await waitFor(() => expect(mocks.getReminder).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Today/ }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('taskList.schedule.saveFailed'),
    );
    expect(mocks.updateTask).toHaveBeenCalledWith('T-1', { dueDate: expect.any(String) });
    // busy is released so a second click retries instead of dead-ending.
    await waitFor(() => expect(screen.getByRole('button', { name: /Today/ })).not.toBeDisabled());
  });

  it('toasts on a failed reminder save and keeps the preset enabled for retry', async () => {
    mocks.getReminder.mockResolvedValue({ data: { remindAt: null } });
    mocks.setReminder.mockRejectedValue(new Error('offline'));

    await openScheduleDialog();

    const preset = screen.getByRole('button', { name: 'hour' });
    await waitFor(() => expect(preset).not.toBeDisabled());
    fireEvent.click(preset);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('taskList.schedule.saveFailed'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'hour' })).not.toBeDisabled());
  });
});
