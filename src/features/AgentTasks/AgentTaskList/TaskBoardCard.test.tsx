/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskBoardCard from './TaskBoardCard';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-1' as string | undefined,
  fetchTaskDetail: vi.fn(),
  navigate: vi.fn(),
  openTopicDrawer: vi.fn(),
  taskDetailMap: {} as Record<string, unknown>,
  updateTask: vi.fn(),
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

vi.mock('@/components/GeneratingBorder', () => ({
  default: ({ children, generating }: { children: ReactNode; generating?: boolean }) => (
    <div data-generating={generating ? 'true' : 'false'}>{children}</div>
  ),
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: any) =>
    selector({
      fetchTaskDetail: mocks.fetchTaskDetail,
      openTopicDrawer: mocks.openTopicDrawer,
      taskDetailMap: mocks.taskDetailMap,
      updateTask: mocks.updateTask,
    }),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', async (importOriginal) => ({
  // Keep the real module store helpers (getActiveWorkspaceSlug and friends) —
  // useWorkspaceAwareNavigate reads them on every navigate.
  ...(await importOriginal<object>()),
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('../features/AssigneeAgentSelector', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../features/AssigneeMemberSelector', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../features/AssigneeAvatar', () => ({
  default: ({ agentId }: { agentId?: string | null }) => <span data-agent-avatar={agentId ?? ''} />,
}));

vi.mock('../features/AssigneeUserAvatar', () => ({
  default: ({ userId }: { userId?: string | null }) => <span data-user-avatar={userId ?? ''} />,
}));

vi.mock('../features/TaskStatusIcon', () => ({
  default: ({ status }: { status: string }) => <span data-status-icon={status} />,
}));

vi.mock('../features/TaskPriorityTag', () => ({
  default: () => <span data-testid="priority" />,
}));

vi.mock('../features/TaskSubtaskProgressTag', () => ({
  default: ({ progress }: { progress?: { completed: number; total: number } }) =>
    progress ? (
      <span data-testid="subtask-progress">{`${progress.completed}/${progress.total}`}</span>
    ) : null,
}));

vi.mock('../features/TaskTriggerTag', () => ({
  default: () => <span data-testid="trigger" />,
}));

vi.mock('../features/formatTaskItemDate', () => ({
  formatTaskItemDate: () => 'Sep 15',
}));

vi.mock('../features/useTaskItemContextMenu', () => ({
  useTaskItemContextMenu: () => ({ items: [], onContextMenu: vi.fn() }),
}));

const createTask = (overrides: Record<string, unknown> = {}) =>
  ({
    assigneeAgentId: 'agt_owner',
    assigneeUserId: 'user-1',
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    createdByUserId: 'user-0',
    identifier: 'T-22',
    name: 'Hourly trend update',
    priority: 2,
    status: 'backlog',
    updatedAt: new Date('2026-05-18T00:00:00.000Z'),
    visibility: 'public',
    ...overrides,
  }) as any;

describe('TaskBoardCard', () => {
  beforeEach(() => {
    mocks.activeWorkspaceId = 'workspace-1';
    mocks.fetchTaskDetail.mockReset();
    mocks.navigate.mockClear();
    mocks.openTopicDrawer.mockClear();
    mocks.updateTask.mockClear();
    mocks.taskDetailMap = {};
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Cordy card skeleton: identifier, status glyph, title, chips, meta', () => {
    render(<TaskBoardCard task={createTask()} />);

    expect(screen.getByText('T-22')).toBeInTheDocument();
    expect(screen.getByText('Hourly trend update')).toBeInTheDocument();
    expect(document.querySelector('[data-status-icon="backlog"]')).toBeInTheDocument();
    expect(screen.getByTestId('priority')).toBeInTheDocument();
    expect(screen.getByText('Sep 15')).toBeInTheDocument();
    // Executor slot (top-right) shows the agent; owner slot (meta row) the member.
    expect(document.querySelector('[data-agent-avatar="agt_owner"]')).toBeInTheDocument();
    expect(document.querySelector('[data-user-avatar="user-1"]')).toBeInTheDocument();
  });

  it('falls back to the identifier as title when the task has no name', () => {
    render(<TaskBoardCard task={createTask({ name: null })} />);

    // identifier appears twice: the caption row and the title row
    expect(screen.getAllByText('T-22').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the description preview line when present', () => {
    render(<TaskBoardCard task={createTask({ description: 'Roll up the weekly numbers' })} />);

    expect(screen.getByText('Roll up the weekly numbers')).toBeInTheDocument();
  });

  it('shows the reviewer — not the assignee — in the owner slot while paused', () => {
    render(
      <TaskBoardCard task={createTask({ reviewerUserId: 'user-reviewer', status: 'paused' })} />,
    );

    expect(document.querySelector('[data-user-avatar="user-reviewer"]')).toBeInTheDocument();
    // The executor assignee is not rendered in the owner slot.
    expect(document.querySelector('[data-user-avatar="user-1"]')).not.toBeInTheDocument();
  });

  it('lights the generating border while running', () => {
    const { container } = render(<TaskBoardCard task={createTask({ status: 'running' })} />);

    expect(container.querySelector('[data-generating="true"]')).toBeInTheDocument();
  });

  it('exposes the open-run affordance for a running task with a live topic', () => {
    const { container } = render(
      <TaskBoardCard
        task={createTask({ currentTopicId: 'topic-1', name: 'Run me', status: 'running' })}
      />,
    );

    const openRun = container.querySelector('[data-tooltip="Open run"]');
    expect(openRun).toBeInTheDocument();
    fireEvent.click(openRun!.querySelector('button')!);

    expect(mocks.openTopicDrawer).toHaveBeenCalledWith('topic-1', {
      agentId: 'agt_owner',
      taskId: 'T-22',
      title: 'Run me',
    });
  });

  it('navigates to the task detail on click', () => {
    const { container } = render(<TaskBoardCard task={createTask()} />);

    fireEvent.click(container.querySelector('[data-task-board-card]')!);

    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_owner/task/T-22/hourly-trend-update');
  });

  it('keeps the overlay twin inert — no navigation, no context menu', () => {
    const { container } = render(<TaskBoardCard overlay task={createTask()} />);

    fireEvent.click(container.querySelector('[data-task-board-card]')!);

    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
