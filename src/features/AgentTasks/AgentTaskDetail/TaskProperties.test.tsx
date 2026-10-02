/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
