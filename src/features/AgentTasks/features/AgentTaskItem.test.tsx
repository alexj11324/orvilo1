/**
 * @vitest-environment happy-dom
 */
import { Icon } from '@lobehub/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';

import AgentTaskItem from './AgentTaskItem';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-1' as string | undefined,
  fetchTaskDetail: vi.fn(),
  navigate: vi.fn(),
  taskDetailMap: {} as Record<string, unknown>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Tooltip: ({ children, title }: { children: ReactNode; title?: ReactNode }) => (
    <span data-tooltip={String(title ?? '')}>{children}</span>
  ),
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: any) =>
    selector({
      fetchTaskDetail: mocks.fetchTaskDetail,
      taskDetailMap: mocks.taskDetailMap,
    }),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', async (importOriginal) => ({
  // Keep the real module store helpers (getActiveWorkspaceSlug and friends) —
  // useWorkspaceAwareNavigate reads them on every navigate.
  ...(await importOriginal<object>()),
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('./AssigneeAgentSelector', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./AssigneeMemberSelector', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../shared/useAgentDisplayMeta', () => ({
  useAgentDisplayMeta: (agentId?: string | null) =>
    agentId ? { avatar: 'agent-avatar', backgroundColor: '#fff', title: 'Ryan' } : undefined,
}));

vi.mock('../shared/useUserDisplayMeta', () => ({
  useUserDisplayMeta: (userId?: string | null) =>
    userId ? { avatar: 'member-avatar', title: 'Shadow Arvin' } : undefined,
}));

vi.mock('./formatTaskItemDate', () => ({
  formatTaskItemDate: () => 'today',
}));

vi.mock('./TaskPriorityTag', () => ({
  default: () => <span>priority</span>,
}));

vi.mock('./TaskStatusTag', () => ({
  default: () => <span>status</span>,
}));

vi.mock('../shared/TaskWorkflowBadge', () => ({
  default: ({ workflowCategory }: { workflowCategory?: string }) => (
    <span data-task-workflow-state={workflowCategory} data-testid="workflow-badge" />
  ),
}));

vi.mock('./TaskSubtaskProgressTag', () => ({
  default: ({
    onRequestSubtasks,
    progress,
  }: {
    onRequestSubtasks?: () => Promise<unknown[]>;
    progress?: { completed: number; total: number };
  }) =>
    progress ? (
      <button data-testid="subtask-progress" type="button" onClick={onRequestSubtasks}>
        {`${progress.completed}/${progress.total}`}
      </button>
    ) : null,
}));

vi.mock('./TaskTriggerTag', () => ({
  default: ({ heartbeatInterval }: { heartbeatInterval?: number | null }) => (
    <span data-testid="trigger">{heartbeatInterval}</span>
  ),
}));

vi.mock('./useTaskItemContextMenu', () => ({
  useTaskItemContextMenu: () => ({ items: [], onContextMenu: vi.fn() }),
}));

const createTask = (assigneeAgentId?: string | null) =>
  ({
    assigneeAgentId,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    identifier: 'T-22',
    name: 'Hourly trend update',
    priority: 2,
    status: 'scheduled',
    updatedAt: new Date('2026-05-18T00:00:00.000Z'),
  }) as any;

describe('AgentTaskItem', () => {
  beforeEach(() => {
    mocks.activeWorkspaceId = 'workspace-1';
    mocks.fetchTaskDetail.mockReset();
    mocks.navigate.mockClear();
    mocks.taskDetailMap = {};
  });

  afterEach(() => {
    cleanup();
  });

  it('opens an assigned task inside its owning agent route', () => {
    render(<AgentTaskItem task={createTask('agt_owner')} />);

    fireEvent.click(screen.getByText('Hourly trend update'));

    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_owner/task/T-22/hourly-trend-update');
  });

  it('opens an assigned task on the global detail route in global scope', () => {
    render(<AgentTaskItem routeScope="global" task={createTask('agt_owner')} />);

    fireEvent.click(screen.getByText('Hourly trend update'));

    expect(mocks.navigate).toHaveBeenCalledWith('/task/T-22/hourly-trend-update');
  });

  it('falls back to the global task detail route when the task has no assignee', () => {
    render(<AgentTaskItem task={createTask(null)} />);

    fireEvent.click(screen.getByText('Hourly trend update'));

    expect(mocks.navigate).toHaveBeenCalledWith('/task/T-22/hourly-trend-update');
  });

  it('shows the assigned agent and member names in tooltips', () => {
    const { container } = render(
      <AgentTaskItem
        task={{ ...createTask('agt_owner'), assigneeUserId: 'user-1', automationMode: 'schedule' }}
      />,
    );

    expect(container.querySelector('[data-tooltip="Ryan"]')).toBeInTheDocument();
    expect(container.querySelector('[data-tooltip="Shadow Arvin"]')).toBeInTheDocument();
  });

  it('keeps an existing member assignee visible in personal mode', () => {
    mocks.activeWorkspaceId = undefined;
    const { container } = render(
      <AgentTaskItem task={{ ...createTask('agt_owner'), assigneeUserId: 'user-1' }} />,
    );

    expect(container.querySelector('[data-tooltip="Shadow Arvin"]')).toBeInTheDocument();
  });

  it('uses an action label when an assignment is empty', () => {
    const { container, rerender } = render(
      <AgentTaskItem task={{ ...createTask(null), automationMode: null }} />,
    );

    expect(container.querySelectorAll('[data-tooltip="taskList.assignTo"]')).toHaveLength(2);

    rerender(
      <AgentTaskItem
        task={{ ...createTask('agt_owner'), assigneeUserId: 'user-1', automationMode: null }}
      />,
    );

    expect(container.querySelector('[data-tooltip="taskList.assignTo"]')).not.toBeInTheDocument();
  });

  it('uses list summaries without fetching task detail', () => {
    render(
      <AgentTaskItem
        task={{
          ...createTask('agt_parent'),
          automationMode: 'heartbeat',
          heartbeatInterval: 1800,
          subtaskProgress: { completed: 3, total: 8 },
        }}
      />,
    );

    expect(mocks.fetchTaskDetail).not.toHaveBeenCalled();
    expect(screen.getByTestId('subtask-progress')).toHaveTextContent('3/8');
    expect(screen.getByTestId('trigger')).toHaveTextContent('1800');
  });

  it('fetches subtask navigation only after the progress badge is clicked', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      subtasks: [{ identifier: 'T-23', status: 'backlog' }],
    });

    render(
      <AgentTaskItem
        task={{
          ...createTask('agt_parent'),
          subtaskProgress: { completed: 0, total: 1 },
        }}
      />,
    );

    expect(mocks.fetchTaskDetail).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('subtask-progress'));

    await waitFor(() => expect(mocks.fetchTaskDetail).toHaveBeenCalledWith('T-22'));
  });

  it('revalidates subtask navigation when an earlier detail is cached', async () => {
    mocks.taskDetailMap = {
      'T-22': { subtasks: [{ identifier: 'T-stale', status: 'completed' }] },
    };
    mocks.fetchTaskDetail.mockResolvedValue({
      subtasks: [{ identifier: 'T-current', status: 'backlog' }],
    });

    render(
      <AgentTaskItem
        task={{
          ...createTask('agt_parent'),
          subtaskProgress: { completed: 0, total: 1 },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('subtask-progress'));

    await waitFor(() => expect(mocks.fetchTaskDetail).toHaveBeenCalledWith('T-22'));
  });

  it('keeps the inline priority selector and workflow chip on shared scopes', () => {
    render(
      <AgentTaskItem
        task={{
          ...createTask('agt_owner'),
          workflowCategory: 'in_review',
          workflowStateId: 'in-review',
        }}
      />,
    );

    expect(screen.getByText('priority')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-badge')).toBeInTheDocument();
  });

  it('uses the board workflow glyph in project rows when execution status differs', () => {
    const { container } = render(
      <AgentTaskItem
        linearIssueRow
        task={{
          ...createTask('agt_owner'),
          workflowCategory: 'in_review',
          workflowStateId: 'in-review',
        }}
      />,
    );

    // The linked task is execution-scheduled but workflow-in-review. Its
    // project row shows the canonical workflow glyph, without an execution
    // status selector that would open the wrong status menu.
    expect(screen.queryByTestId('workflow-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('status')).not.toBeInTheDocument();

    const priority = screen.getByText('priority');
    const identifier = screen.getByText('T-22');
    const statusIcon = container.querySelector('[data-task-workflow-icon="in_review"]');
    const title = screen.getByText('Hourly trend update');
    expect(statusIcon).toBeInTheDocument();
    const { container: canonical } = render(
      <Icon icon={WORKFLOW_CATEGORY_VISUALS.in_review.icon} size={16} />,
    );
    expect(statusIcon?.querySelector('svg')?.innerHTML).toBe(
      canonical.querySelector('svg')?.innerHTML,
    );
    expect(statusIcon?.querySelector('svg')).toHaveAttribute(
      'stroke',
      WORKFLOW_CATEGORY_VISUALS.in_review.color,
    );

    expect(
      priority.compareDocumentPosition(identifier) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      identifier.compareDocumentPosition(statusIcon!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      statusIcon!.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the execution status icon for project rows without linked workflow state', () => {
    const { container } = render(<AgentTaskItem linearIssueRow task={createTask('agt_owner')} />);

    expect(screen.getByText('status')).toBeInTheDocument();
    expect(container.querySelector('[data-task-workflow-icon]')).not.toBeInTheDocument();
  });
});
