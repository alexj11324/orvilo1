/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskParentBar from './TaskParentBar';

const mocks = vi.hoisted(() => ({
  allowed: true,
  getDetail: vi.fn(),
  navigate: vi.fn(),
  openRelationModal: vi.fn(),
  updateTask: vi.fn(),
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
  useTaskStore: (selector: any) => selector({ ...mocks.taskState, updateTask: mocks.updateTask }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: mocks.allowed }),
}));

vi.mock('./TaskIssueRelationModal', () => ({
  openTaskIssueRelationModal: mocks.openRelationModal,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} type="button" onClick={() => onClick?.()}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ render }: { render?: ReactNode }) => <>{render}</>,
}));

vi.mock('../features/TaskStatusIcon', () => ({
  default: () => <span>status</span>,
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
    mocks.allowed = true;
    mocks.openRelationModal.mockClear();
    mocks.updateTask.mockReset();
    mocks.updateTask.mockResolvedValue(undefined);
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

  it('removes the parent from the bar itself', async () => {
    render(<TaskParentBar />);

    fireEvent.click(screen.getByText('taskDetail.parentBar.remove'));

    expect(mocks.updateTask).toHaveBeenCalledWith('T-child', { parentTaskId: null });
    await waitFor(() => expect(mocks.getDetail).toHaveBeenCalledWith('T-parent'));
  });

  it('changes the parent through the existing parent picker', async () => {
    mocks.taskState.taskDetailMap['T-child'] = {
      ...mocks.taskState.taskDetailMap['T-child'],
      domainRevision: 4,
      id: 'tsk_child',
    };
    render(<TaskParentBar />);

    fireEvent.click(screen.getByText('taskDetail.parentBar.change'));

    expect(mocks.openRelationModal).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDomainRevision: 4,
        kind: 'subIssueOf',
        taskId: 'tsk_child',
      }),
    );
    await waitFor(() => expect(mocks.getDetail).toHaveBeenCalledWith('T-parent'));
  });

  it('offers no parent actions to a viewer who cannot edit', async () => {
    mocks.allowed = false;
    render(<TaskParentBar />);

    expect(screen.queryByText('taskDetail.parentBar.remove')).toBeNull();
    expect(screen.queryByText('taskDetail.parentBar.change')).toBeNull();
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
    expect(screen.queryByText('status')).not.toBeInTheDocument();
  });

  it('reads an uncategorized parent as backlog, never as an execution icon', async () => {
    mocks.getDetail.mockResolvedValue({
      data: {
        agentId: 'agt_parent',
        identifier: 'T-parent',
        instruction: 'Parent instruction',
        status: 'running',
        subtasks: [],
      },
    });

    const { container } = render(<TaskParentBar />);

    await waitFor(() => expect(mocks.getDetail).toHaveBeenCalledWith('T-parent'));
    expect(container.querySelector('[data-workflow-icon="backlog"]')).toBeInTheDocument();
    expect(screen.queryByText('status')).not.toBeInTheDocument();
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
