/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import KanbanColumn, { CollapsedKanbanColumn } from './KanbanColumn';
import TaskBoardCard from './TaskBoardCard';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-1' as string | undefined,
  droppableCalls: [] as { disabled?: boolean; id: string }[],
  fetchTaskDetail: vi.fn(),
  navigate: vi.fn(),
  openTopicDrawer: vi.fn(),
  projects: [] as { id: string; name: string }[],
  showContextMenuWithFallback: vi.fn((_items: unknown, _options: unknown, showWeb: () => void) => {
    showWeb();
  }),
  taskContextMenu: vi.fn(),
  taskDetailMap: {} as Record<string, unknown>,
  updateTask: vi.fn(),
  workflowGlyph: undefined as
    { color: string; icon: ComponentType<{ color?: string; size?: number }> } | undefined,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    // Emulate i18next's {{slot}} interpolation so assertions read real copy.
    t: (key: string, options?: Record<string, unknown>) => {
      const template = String(options?.defaultValue ?? key);
      return Object.entries(options ?? {}).reduce(
        (acc, [slot, value]) =>
          slot === 'defaultValue' ? acc : acc.replace(`{{${slot}}}`, String(value)),
        template,
      );
    },
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <span data-tooltip>{children}</span>,
  TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
}));

vi.mock('@/libs/contextMenu', () => ({
  closeContextMenu: vi.fn(),
  showContextMenuWithFallback: mocks.showContextMenuWithFallback,
}));

vi.mock('@/components/GeneratingBorder', () => ({
  // Mirrors the real component: injected props die here, only children render.
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

vi.mock('@/store/project', () => ({
  useCurrentProjectList: () => mocks.projects,
  useProjectStore: (selector: any) =>
    selector({
      useFetchProjectList: () => ({}),
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

vi.mock('../features/TaskExecutionBadge', () => ({
  default: () => <span data-testid="execution-badge" />,
}));

vi.mock('../shared/TaskWorkflowBadge', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTaskWorkflowGlyph: () => mocks.workflowGlyph,
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
  useTaskItemContextMenu: () => ({ items: [], onContextMenu: mocks.taskContextMenu }),
}));

vi.mock('@dnd-kit/core', () => ({
  useDndContext: () => ({ active: null }),
  useDroppable: ({ disabled, id }: { disabled?: boolean; id: string }) => {
    mocks.droppableCalls.push({ disabled, id });
    return { isOver: false, setNodeRef: () => {} };
  },
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock('@/components/ActionIcon', () => ({
  default: ({
    'aria-label': ariaLabel,
    'icon': Icon,
    onClick,
    title,
  }: {
    'aria-label'?: string;
    'icon'?: LucideIcon;
    'onClick'?: () => void;
    'title'?: string;
  }) => (
    <button aria-label={ariaLabel ?? title} title={title} type="button" onClick={onClick}>
      {typeof Icon === 'function' ? <Icon size={14} /> : null}
    </button>
  ),
}));

vi.mock('./TaskGroupLabel', () => ({
  default: () => <span data-group-label />,
}));

vi.mock('./TaskItemSkeleton', () => ({
  default: () => <div data-task-skeleton />,
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
    mocks.projects = [];
    mocks.updateTask.mockClear();
    mocks.showContextMenuWithFallback.mockClear();
    mocks.taskContextMenu.mockClear();
    mocks.taskDetailMap = {};
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a plain description summary without Markdown syntax', () => {
    render(
      <TaskBoardCard
        task={createTask({ description: '**Review** [the change](https://example.com)' })}
      />,
    );
    expect(screen.getByText('Review the change')).toBeInTheDocument();
    expect(screen.queryByText(/\*\*Review/)).toBeNull();
  });

  it('renders the Cordy card skeleton: identifier, status glyph, title, chips, meta', () => {
    render(<TaskBoardCard task={createTask()} />);

    expect(screen.getByText('T-22')).toBeInTheDocument();
    expect(screen.getByText('Hourly trend update')).toBeInTheDocument();
    // One status mark — the workflow-category glyph slot — plus the read-only
    // execution badge.
    expect(document.querySelector('[data-collab-id$=":status"]')).toBeInTheDocument();
    expect(screen.getByTestId('execution-badge')).toBeInTheDocument();
    expect(screen.getByTestId('priority')).toBeInTheDocument();
    // Linear cards stamp the creation date — "Created <date>".
    expect(screen.getByText('Created Sep 15')).toBeInTheDocument();
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

  it('shows the reviewer — not the assignee — in the owner slot while in review', () => {
    render(
      <TaskBoardCard
        task={createTask({ reviewerUserId: 'user-reviewer', workflowCategory: 'in_review' })}
      />,
    );

    expect(document.querySelector('[data-user-avatar="user-reviewer"]')).toBeInTheDocument();
    // The executor assignee is not rendered in the owner slot.
    expect(document.querySelector('[data-user-avatar="user-1"]')).not.toBeInTheDocument();
  });

  describe.each([false, true])('generating border (overlay: %s)', (overlay) => {
    it.each([
      ['running', 'in_progress', true],
      ['running', 'in_review', true],
      ['running', 'todo', false],
      ['running', 'backlog', false],
      ['running', 'triage', false],
      ['running', 'done', false],
      ['running', 'canceled', false],
      ['running', undefined, false],
      ['paused', 'in_progress', false],
      ['completed', 'in_review', false],
    ] as const)('status %s in category %s animates: %s', (status, workflowCategory, generating) => {
      const { container } = render(
        <TaskBoardCard overlay={overlay} task={createTask({ status, workflowCategory })} />,
      );

      expect(container.querySelector('[data-generating]')).toHaveAttribute(
        'data-generating',
        String(generating),
      );
    });
  });

  it('exposes the open-run affordance for a running task with a live topic', () => {
    render(
      <TaskBoardCard
        task={createTask({ currentTopicId: 'topic-1', name: 'Run me', status: 'running' })}
      />,
    );

    const openRun = screen.getByRole('button', { name: 'Open run' });
    fireEvent.click(openRun);

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

  it('reaches the context-menu handler through a real DOM contextmenu on the card', () => {
    const { container } = render(<TaskBoardCard task={createTask()} />);

    // Regression: the trigger must bind the card div itself. A wrapper that
    // drops injected props (GeneratingBorder) left the card without a
    // contextmenu handler at all.
    fireEvent.contextMenu(container.querySelector('[data-task-board-card]')!);

    expect(mocks.taskContextMenu).toHaveBeenCalledTimes(1);
    expect(mocks.taskContextMenu).toHaveBeenCalledWith(expect.any(Function));
  });

  it('renders the project chip only when the projectId resolves to a name', () => {
    mocks.projects = [{ id: 'proj-1', name: 'Voyager Launch' }];
    const { rerender } = render(<TaskBoardCard task={createTask({ projectId: 'proj-1' })} />);
    expect(screen.getByText('Voyager Launch')).toBeInTheDocument();

    // Unknown ids render nothing — never a raw projectId.
    rerender(<TaskBoardCard task={createTask({ projectId: 'proj-gone' })} />);
    expect(screen.queryByText('Voyager Launch')).not.toBeInTheDocument();
    expect(screen.queryByText('proj-gone')).not.toBeInTheDocument();
  });
});

describe('KanbanColumn (empty-board regression)', () => {
  beforeEach(() => {
    mocks.droppableCalls.length = 0;
  });

  it('keeps header, count, actions and the droppable body when the column has no cards', () => {
    const onCreate = vi.fn();
    const onHide = vi.fn();
    render(
      <KanbanColumn
        droppable
        columnKey="todo"
        groupBy="status"
        tasks={[]}
        total={0}
        onCreate={onCreate}
        onHide={onHide}
      />,
    );

    // Header: status label + zero count stay mounted with zero tasks.
    expect(screen.getByText('taskList.kanban.todo')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();

    // Actions: hide + add affordances render and stay wired. The add affordance
    // exists twice — the header icon and the body's empty-column pill.
    fireEvent.click(screen.getByTitle('taskList.kanban.hideColumn'));
    expect(onHide).toHaveBeenCalledTimes(1);
    const addAffordances = screen.getAllByTitle('taskList.kanban.addTask');
    expect(addAffordances).toHaveLength(2);
    fireEvent.click(addAffordances[0]);
    fireEvent.click(addAffordances[1]);
    expect(onCreate).toHaveBeenCalledTimes(2);

    // The column still registers itself as a live drop target.
    expect(mocks.droppableCalls).toContainEqual({ disabled: false, id: 'todo' });
  });

  it('registers the droppable as disabled when the column refuses drops', () => {
    render(
      <KanbanColumn columnKey="done" droppable={false} groupBy="status" tasks={[]} total={0} />,
    );

    expect(mocks.droppableCalls).toContainEqual({ disabled: true, id: 'done' });
  });

  it('keeps the folded rail a live drop target and expands on click', () => {
    const onExpand = vi.fn();
    render(
      <CollapsedKanbanColumn
        droppable
        columnKey="done"
        label="taskList.kanban.done"
        total={3}
        onExpand={onExpand}
      />,
    );

    const button = screen.getByRole('button', { name: 'taskList.kanban.showColumn' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onExpand).toHaveBeenCalledTimes(1);

    expect(mocks.droppableCalls).toContainEqual({ disabled: false, id: 'done' });
  });
});
