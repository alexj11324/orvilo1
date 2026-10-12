/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskExecutionBadge from '../features/TaskExecutionBadge';
import TaskProperties from './TaskProperties';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-1' as string | undefined,
  labelSelectorDefaultOpen: vi.fn(),
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

vi.mock(import('@/features/HeterogeneousAgent/builtinHarness'), async (importOriginal) => ({
  ...(await importOriginal()),
  useBuiltinHarnessOffered: () => true,
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
  default: ({ children, defaultOpen }: { children?: ReactNode; defaultOpen?: boolean }) => {
    mocks.labelSelectorDefaultOpen(defaultOpen);
    return <>{children}</>;
  },
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
    mocks.labelSelectorDefaultOpen.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it.each(['{Enter}', ' '])(
    'opens the detail status trigger once with %s and commits a workflow pick',
    async (key) => {
      const user = userEvent.setup();
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        render(<TaskProperties />);
        const trigger = screen.getByRole('button', {
          name: 'taskDetail.workflow.category.backlog',
        });
        const click = vi.fn();
        trigger.addEventListener('click', click);
        trigger.focus();
        await user.keyboard(key);
        expect(await screen.findByRole('menu')).toBeVisible();
        expect(screen.getAllByRole('menu')).toHaveLength(1);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(click).toHaveBeenCalledOnce();
        expect(errorLog).not.toHaveBeenCalled();
        await user.click(screen.getByRole('menuitem', { name: /taskList.kanban.todo/ }));
        await waitFor(() => expect(mocks.moveWorkflow).toHaveBeenCalledOnce());
        expect(mocks.moveWorkflow).toHaveBeenCalledWith({
          taskIdentifier: 'T-1',
          target: { category: 'todo', workflowStateRefId: undefined },
        });
      } finally {
        errorLog.mockRestore();
      }
    },
  );

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
    const statusRows = screen.getAllByText(/^taskList\.kanban\./);
    for (const row of statusRows) {
      expect(row.parentElement?.querySelector('[data-workflow-icon]')).toBeTruthy();
    }
    const columnLabels = statusRows.map((node) => node.textContent);
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

  it('lets a pending-review issue move back to todo through the workflow command', async () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    detail.workflowCategory = 'in_review';
    detail.status = 'paused';
    try {
      const { container } = render(<TaskProperties />);
      expect(
        container.querySelector(
          '[data-task-workflow-state="in_review"] [data-workflow-icon="in_review"]',
        ),
      ).toBeTruthy();
      fireEvent.click(screen.getByText('taskDetail.workflow.category.in_review'));
      await waitFor(() => expect(screen.getByText('taskList.kanban.todo')).toBeTruthy());
      fireEvent.click(screen.getByText('taskList.kanban.todo'));
      await waitFor(() =>
        expect(mocks.moveWorkflow).toHaveBeenCalledWith({
          taskIdentifier: 'T-1',
          target: { category: 'todo', workflowStateRefId: undefined },
        }),
      );
    } finally {
      delete detail.workflowCategory;
      detail.status = 'backlog';
    }
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

  it('always shows Execution once an agent is assigned, as "not started" before any run', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    detail.agentId = 'agent-1';
    detail.workflowCategory = 'todo';
    try {
      render(<TaskProperties />);
      const execution = screen.getByRole('group', { name: 'taskDetail.executionStatus' });
      expect(execution.textContent).toContain('taskDetail.execution.view.notStarted');
      expect(execution.textContent).toContain('taskDetail.execution.hint.moveToStart');
      // Starting is the status move; there is no button for it here.
      expect(execution.querySelector('button')).toBeNull();
    } finally {
      delete detail.agentId;
      delete detail.workflowCategory;
    }
  });

  it('says an In Progress Issue with no agent needs one', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    detail.workflowCategory = 'in_progress';
    try {
      render(<TaskProperties />);
      const execution = screen.getByRole('group', { name: 'taskDetail.executionStatus' });
      expect(execution.textContent).toContain('taskDetail.execution.view.needsAgent');
      expect(execution.textContent).toContain('taskDetail.execution.hint.needsAgent');
    } finally {
      delete detail.workflowCategory;
    }
  });

  it('reads a succeeded run that is not accepted yet differently from Done', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    detail.agentId = 'agent-1';
    detail.dispatchPhase = 'succeeded';
    detail.status = 'paused';
    detail.workflowCategory = 'in_review';
    try {
      const { unmount } = render(<TaskProperties />);
      expect(screen.getByText('taskDetail.execution.view.awaitingAcceptance')).toBeTruthy();
      unmount();

      detail.status = 'completed';
      detail.workflowCategory = 'done';
      render(<TaskProperties />);
      expect(screen.queryByText('taskDetail.execution.view.awaitingAcceptance')).toBeNull();
      expect(screen.getByText('succeeded')).toBeTruthy();
    } finally {
      delete detail.agentId;
      delete detail.dispatchPhase;
      detail.status = 'backlog';
      delete detail.workflowCategory;
    }
  });

  it('shows why the latest run failed as plain text under the failed state', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    const reason = '<img src=x onerror=alert(1)> **exit 1**';
    detail.dispatchPhase = 'failed';
    detail.status = 'failed';
    detail.workflowCategory = 'in_progress';
    detail.activities = [{ error: reason, id: 'run-1', seq: 1, status: 'failed', type: 'topic' }];
    try {
      const { container } = render(<TaskProperties />);
      expect(screen.getByTestId('run-failure-reason').textContent).toBe(reason);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('strong')).toBeNull();
    } finally {
      delete detail.dispatchPhase;
      detail.status = 'backlog';
      delete detail.workflowCategory;
      delete detail.activities;
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

    // Adding a due date goes straight to its dialog. No empty row is left
    // behind, so there is nothing to lose by looking at another Issue.
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.property.add' }));
    fireEvent.click(await screen.findByText('taskDetail.dueDate'));

    expect(mocks.openTaskScheduleDialog).toHaveBeenCalledWith({ dueDate: null, identifier: 'T-1' });
    expect(screen.queryByRole('group', { name: 'taskDetail.dueDate' })).toBeNull();

    // Labels need their row as the picker's anchor: it appears with the picker open.
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.property.add' }));
    fireEvent.click(await screen.findByText('taskDetail.labels.title'));

    expect(screen.getByRole('group', { name: 'taskDetail.labels.title' })).toBeTruthy();
    // Open on mount, and only then: a later rebuild of the row must not reopen it.
    expect(mocks.labelSelectorDefaultOpen.mock.calls[0]).toEqual([true]);
    await waitFor(() => expect(mocks.labelSelectorDefaultOpen).toHaveBeenLastCalledWith(false));
  });

  // The due date used to be a clickable <div>: no role, no tab stop, so the
  // dialog could not be opened from the keyboard.
  it('exposes the due date as a focusable button that opens the schedule dialog', async () => {
    const detailMap = mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>;
    const original = detailMap['T-1'];
    detailMap['T-1'] = { ...original, dueDate: '2026-05-01T00:00:00.000Z' };
    try {
      render(<TaskProperties />);

      const dueDate = within(screen.getByRole('group', { name: 'taskDetail.dueDate' })).getByRole(
        'button',
      );
      expect(dueDate.tagName).toBe('BUTTON');
      expect(dueDate.tabIndex).toBe(0);

      fireEvent.click(dueDate);
      expect(mocks.openTaskScheduleDialog).toHaveBeenCalledWith({
        dueDate: '2026-05-01T00:00:00.000Z',
        identifier: 'T-1',
      });
    } finally {
      detailMap['T-1'] = original;
    }
  });
});
