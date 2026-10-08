/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskExecutionBadge from '../features/TaskExecutionBadge';
import TaskProperties from './TaskProperties';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-1' as string | undefined,
  moveWorkflow: vi.fn(),
  openTaskScheduleDialog: vi.fn(),
  taskState: {
    activeTaskId: 'T-1',
    taskDetailMap: {
      'T-1': {
        identifier: 'T-1',
        labels: [],
        priority: 0,
        status: 'backlog',
        visibility: 'public',
      },
    },
    taskInstructionRevisionMap: {},
    taskSaveStatusMap: {},
    updateTask: vi.fn(),
  } as Record<string, unknown>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mocks.taskState),
}));

vi.mock('antd-style', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cssVar: {
    colorTextDescription: '#999',
    colorTextSecondary: '#666',
  },
}));

vi.mock('@/features/Labels/LabelChips', () => ({
  default: () => <span>labels</span>,
}));

vi.mock('../features/AssigneeMemberSelector', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../features/AssigneeUserAvatar', () => ({
  default: () => <span>member assignee</span>,
}));

vi.mock('../features/TaskLabelSelector', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../features/TaskPriorityTag', () => ({
  default: () => <span>priority</span>,
}));

vi.mock('../features/TaskScheduleDialog', () => ({
  openTaskScheduleDialog: mocks.openTaskScheduleDialog,
}));

vi.mock('../features/TaskTriggerTag', () => ({
  default: () => <span>trigger</span>,
}));

vi.mock('../features/UnassignedAssigneeIcon', () => ({
  UnassignedAssigneeIcon: () => <span>unassigned</span>,
}));

vi.mock('../features/useIssueStatusMove', () => ({
  useIssueStatusMove: () => mocks.moveWorkflow,
}));

vi.mock('../features/useTeamWorkflowStates', () => ({
  useTeamWorkflowStates: () => undefined,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

vi.mock('../shared/useUserDisplayMeta', () => ({
  useUserDisplayMeta: () => undefined,
}));

vi.mock('./TaskPrerequisites', () => ({
  default: () => <div>relations</div>,
  TaskBlockedNotice: () => null,
}));

vi.mock('./TaskScheduleConfig', () => ({
  default: () => <div>schedule</div>,
}));

describe('TaskProperties', () => {
  beforeEach(() => {
    mocks.activeWorkspaceId = 'workspace-1';
    mocks.moveWorkflow.mockClear();
    mocks.openTaskScheduleDialog.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // The status chip is the menu's trigger element — a wrapper that swallows
  // the props the menu clones on (e.g. a title-less Tooltip) leaves a dead
  // chip. Clicking it must open the Issue-status menu.
  it('opens the workflow-only Issue status menu when the status chip is clicked', async () => {
    render(<TaskProperties />);

    fireEvent.click(screen.getByText('taskDetail.workflow.category.backlog'));

    await waitFor(() => {
      expect(screen.getByText('taskList.kanban.triage')).toBeTruthy();
    });

    // The seven workflow categories — execution run states (running,
    // paused, …) are never a status pick anymore.
    const columnLabels = screen.getAllByText(/^taskList\.kanban\./).map((node) => node.textContent);
    expect(columnLabels).toEqual([
      'taskList.kanban.triage',
      'taskList.kanban.backlog',
      'taskList.kanban.todo',
      'taskList.kanban.inProgress',
      'taskList.kanban.inReview',
      'taskList.kanban.done',
      'taskList.kanban.canceled',
    ]);
  });

  it('commits the pick through the shared moveIssueWorkflow command', async () => {
    render(<TaskProperties />);

    fireEvent.click(screen.getByText('taskDetail.workflow.category.backlog'));
    await waitFor(() => {
      expect(screen.getByText('taskList.kanban.inProgress')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('taskList.kanban.inProgress'));

    await waitFor(() => {
      expect(mocks.moveWorkflow).toHaveBeenCalledWith({
        taskIdentifier: 'T-1',
        target: { category: 'in_progress', workflowStateRefId: undefined },
      });
    });
  });

  it('opens the status menu from a workflow-linked status chip', async () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    detail.workflowCategory = 'backlog';
    detail.workflowStateId = 'state-backlog';

    render(<TaskProperties />);

    fireEvent.click(screen.getByText('taskDetail.workflow.category.backlog'));

    await waitFor(() => {
      expect(screen.getByText('taskList.kanban.inProgress')).toBeTruthy();
    });

    delete detail.workflowCategory;
    delete detail.workflowStateId;
  });

  it('shows a parked dispatch as waiting while preserving the canonical backlog workflow', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    detail.status = 'running';
    detail.dispatchPhase = 'waiting';
    detail.workflowCategory = 'backlog';
    try {
      render(<TaskProperties />);
      expect(screen.getByText('waiting')).toBeTruthy();
      expect(screen.getByText('taskDetail.workflow.category.backlog')).toBeTruthy();
      expect(screen.queryByText('running')).toBeNull();
    } finally {
      detail.status = 'backlog';
      delete detail.dispatchPhase;
      delete detail.workflowCategory;
    }
  });

  it('leaves the idle execution property out of the rail without changing compact badges', () => {
    const { unmount } = render(<TaskProperties />);
    expect(screen.queryByText('goalProcess.summary.notStarted')).toBeNull();
    unmount();
    for (const props of [{ status: 'backlog' }, { showLabel: true }]) {
      const { container, unmount: dispose } = render(<TaskExecutionBadge {...props} />);
      expect(container.textContent).toBe('');
      dispose();
    }
  });

  it.each(['queued', 'running', 'waiting'] as const)(
    'keeps the %s execution projection',
    (runState) => {
      render(<TaskExecutionBadge showLabel runState={runState} status="backlog" />);
      expect(screen.getByText(runState)).toBeTruthy();
      expect(screen.queryByText('goalProcess.summary.notStarted')).toBeNull();
    },
  );

  it('renders value-only rows named by their field, without a label column', () => {
    render(<TaskProperties />);

    // Default set, like Linear: Status, Assignee, Priority.
    for (const field of [
      'taskDetail.property.state',
      'taskDetail.assignee',
      'taskDetail.property.priority',
    ]) {
      expect(screen.getByRole('group', { name: field })).toBeTruthy();
      expect(screen.queryByText(field)).toBeNull();
    }

    expect(screen.getByText('taskDetail.workflow.category.backlog')).toBeTruthy();
    expect(screen.getByText('taskDetail.property.addAssignee')).toBeTruthy();
    expect(screen.getByText('priority')).toBeTruthy();
  });

  it('hides unset optional fields and reveals them from the add-property menu', async () => {
    render(<TaskProperties />);

    for (const field of [
      'taskDetail.executionStatus',
      'taskDetail.dueDate',
      'taskDetail.labels.title',
      'taskDetail.property.schedule',
    ]) {
      expect(screen.queryByRole('group', { name: field })).toBeNull();
    }
    expect(screen.queryByText('taskDetail.property.addReviewer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.property.add' }));
    fireEvent.click(await screen.findByText('taskDetail.dueDate'));

    expect(screen.getByRole('group', { name: 'taskDetail.dueDate' })).toBeTruthy();
    expect(screen.getByText('taskDetail.property.addDueDate')).toBeTruthy();
  });

  // The due date used to be a clickable <div>: no role, no tab stop, so the
  // dialog could not be opened from the keyboard.
  it('exposes the due date as a focusable button that opens the schedule dialog', async () => {
    render(<TaskProperties />);

    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.property.add' }));
    fireEvent.click(await screen.findByText('taskDetail.dueDate'));

    const dueDate = screen.getByRole('button', { name: 'taskDetail.property.addDueDate' });
    expect(dueDate.tagName).toBe('BUTTON');
    expect(dueDate.tabIndex).toBe(0);

    fireEvent.click(dueDate);
    expect(mocks.openTaskScheduleDialog).toHaveBeenCalledWith({ dueDate: null, identifier: 'T-1' });
  });
});
