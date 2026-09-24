/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskParentBar from './TaskParentBar';

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  navigate: vi.fn(),
  taskState: {} as any,
}));

const createState = (parent: any) => ({
  activeTaskId: 'T-child',
  taskDetailMap: {
    'T-child': {
      identifier: 'T-child',
      instruction: 'Child instruction',
      parent,
      status: 'running',
    },
  },
});

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/services/task', () => ({
  taskService: {
    getDetail: mocks.getDetail,
  },
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: any) => selector(mocks.taskState),
}));

vi.mock('../features/TaskStatusIcon', () => ({
  default: ({ status }: { status: string }) => <span data-testid="execution-status">{status}</span>,
}));

vi.mock('../shared/useTeamWorkflowCatalog', () => ({
  useTeamWorkflowCatalog: () => ({
    states: [
      { category: 'in_progress', id: 'local-state-progress', name: 'Building', teamId: 'team-1' },
    ],
  }),
}));

vi.mock('../features/TaskSubtaskProgressTag', () => ({
  default: ({
    onSubtaskClick,
    subtasks,
  }: {
    onSubtaskClick?: (identifier: string, assigneeAgentId?: string) => void;
    subtasks?: any[];
  }) => {
    const subtask = subtasks?.[0];
    if (!subtask) return null;

    return (
      <button
        data-testid="parent-subtask"
        type="button"
        onClick={() => onSubtaskClick?.(subtask.identifier, subtask.assignee?.id ?? undefined)}
      >
        subtask
      </button>
    );
  },
}));

describe('TaskParentBar', () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.getDetail.mockReset();
    mocks.taskState = createState({
      agentId: 'agt_parent',
      identifier: 'T-parent',
      name: 'Parent task',
    });
    mocks.getDetail.mockResolvedValue({
      data: {
        agentId: 'agt_parent',
        identifier: 'T-parent',
        instruction: 'Parent instruction',
        status: 'running',
        subtasks: [],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the parent task inside the parent task's owning agent route", async () => {
    render(<TaskParentBar />);

    fireEvent.click(screen.getByText('Parent task').closest('button')!);

    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_parent/task/T-parent/parent-task');
    await waitFor(() => expect(mocks.getDetail).toHaveBeenCalledWith('T-parent'));
  });

  it('falls back to the global route when the parent task owner is unknown', async () => {
    mocks.taskState = createState({
      identifier: 'T-parent',
      name: 'Parent task',
    });
    mocks.getDetail.mockResolvedValue({
      data: {
        agentId: null,
        identifier: 'T-parent',
        instruction: 'Parent instruction',
        status: 'running',
        subtasks: [],
      },
    });

    render(<TaskParentBar />);

    await waitFor(() => expect(mocks.getDetail).toHaveBeenCalledWith('T-parent'));
    fireEvent.click(screen.getByText('Parent task').closest('button')!);

    expect(mocks.navigate).toHaveBeenCalledWith('/task/T-parent/parent-task');
  });

  it('shows the linked parent workflow glyph instead of its execution glyph', async () => {
    mocks.getDetail.mockResolvedValue({
      data: {
        agentId: 'agt_parent',
        identifier: 'T-parent',
        instruction: 'Parent instruction',
        status: 'backlog',
        subtasks: [],
        workflowCategory: 'in_progress',
        workflowStateId: 'linear-in-progress',
      },
    });

    const { container } = render(<TaskParentBar />);

    await waitFor(() =>
      expect(container.querySelector('[data-workflow-icon="in_progress"]')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('execution-status')).not.toBeInTheDocument();
  });

  it('shows a local parent workflow glyph without a remote state ID', async () => {
    mocks.getDetail.mockResolvedValue({
      data: {
        agentId: 'agt_parent',
        identifier: 'T-parent',
        status: 'backlog',
        subtasks: [],
        teamId: 'team-1',
        workflowCategory: 'in_progress',
        workflowStateRefId: 'local-state-progress',
      },
    });

    const { container } = render(<TaskParentBar />);

    await waitFor(() =>
      expect(container.querySelector('[data-workflow-icon="in_progress"]')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('execution-status')).not.toBeInTheDocument();
  });

  it('does not show Backlog while the parent is loading, then shows Scheduled', async () => {
    let resolveDetail!: (result: unknown) => void;
    mocks.getDetail.mockReturnValue(new Promise((resolve) => (resolveDetail = resolve)));

    render(<TaskParentBar />);

    expect(screen.queryByTestId('execution-status')).not.toBeInTheDocument();
    resolveDetail({ data: { identifier: 'T-parent', status: 'scheduled', subtasks: [] } });
    await waitFor(() =>
      expect(screen.getByTestId('execution-status')).toHaveTextContent('scheduled'),
    );
  });

  it("opens parent subtasks inside the clicked subtask's owning agent route", async () => {
    mocks.getDetail.mockResolvedValue({
      data: {
        agentId: 'agt_parent',
        identifier: 'T-parent',
        instruction: 'Parent instruction',
        status: 'running',
        subtasks: [
          {
            assignee: { id: 'agt_sibling' },
            identifier: 'T-sibling',
            status: 'backlog',
          },
        ],
      },
    });

    render(<TaskParentBar />);

    fireEvent.click(await screen.findByTestId('parent-subtask'));

    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_sibling/task/T-sibling');
  });
});
