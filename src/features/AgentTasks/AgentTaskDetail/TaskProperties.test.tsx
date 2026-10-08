/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskExecutionBadge from '../features/TaskExecutionBadge';
import TaskProperties from './TaskProperties';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-1' as string | undefined,
  moveWorkflow: vi.fn(),
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

  it('fills the loaded no-execution property without changing compact badges or unknown state', () => {
    const { unmount } = render(<TaskProperties />);
    expect(screen.getByText('goalProcess.summary.notStarted')).toBeTruthy();
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

  it('renders a Plane label beside each property value', () => {
    render(<TaskProperties />);

    expect(screen.getByText('taskDetail.property.state')).toBeTruthy();
    expect(screen.getByText('taskDetail.workflow.category.backlog')).toBeTruthy();
    expect(screen.getByText('taskDetail.executionStatus')).toBeTruthy();
    expect(screen.getByText('taskDetail.assignee')).toBeTruthy();
    expect(screen.getByText('taskDetail.property.addAssignee')).toBeTruthy();
    expect(screen.getByText('taskDetail.property.priority')).toBeTruthy();
    expect(screen.getByText('priority')).toBeTruthy();
    expect(screen.getByText('taskDetail.dueDate')).toBeTruthy();
    expect(screen.getByText('taskDetail.property.addDueDate')).toBeTruthy();
    expect(screen.getByText('taskDetail.labels.title')).toBeTruthy();
    expect(screen.getByText('taskDetail.property.addLabels')).toBeTruthy();
    expect(screen.getByText('taskDetail.property.schedule')).toBeTruthy();
    expect(screen.queryByText('taskDetail.property.addReviewer')).toBeNull();
  });
});
