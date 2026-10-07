/**
 * @vitest-environment happy-dom
 */
import { ThemeProvider } from '@lobehub/ui';
import type { TeamWorkflowStateItem } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTheme } from 'antd-style';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';

import TaskExecutionBadge from '../features/TaskExecutionBadge';
import TaskProperties from './TaskProperties';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'workspace-1' as string | undefined,
  moveWorkflow: vi.fn(),
  openTaskScheduleDialog: vi.fn(),
  teamStates: [] as TeamWorkflowStateItem[],
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

vi.mock('../features/useIssueStatusMove', () => ({
  useIssueStatusMove: () => mocks.moveWorkflow,
}));

vi.mock('../features/useTeamWorkflowStates', () => ({
  useTeamWorkflowStates: (teamId?: string | null) => (teamId ? mocks.teamStates : null),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

vi.mock('../shared/useUserDisplayMeta', () => ({
  useUserDisplayMeta: () => undefined,
}));

vi.mock('../features/TaskScheduleDialog', () => ({
  openTaskScheduleDialog: mocks.openTaskScheduleDialog,
}));

vi.mock('./TaskDetailAssignee', () => ({
  default: () => <button aria-label="Executing Agent">agent assignment</button>,
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
    mocks.teamStates = [];
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

  it.each(['{Enter}', ' '])('opens a configured due-date value once with %s', async (key) => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    detail.dueDate = '2026-10-15';
    try {
      const user = userEvent.setup();
      render(<TaskProperties />);
      const trigger = screen.getByRole('button', { name: '2026/10/15' });
      expect(trigger.querySelector('svg.lucide-calendar')).toHaveAttribute('aria-hidden', 'true');
      trigger.focus();
      await user.keyboard(key);
      expect(mocks.openTaskScheduleDialog).toHaveBeenCalledOnce();
      expect(mocks.openTaskScheduleDialog).toHaveBeenCalledWith({
        dueDate: '2026-10-15',
        identifier: 'T-1',
      });
    } finally {
      delete detail.dueDate;
    }
  });

  it.each(['light', 'dark'] as const)(
    'paints every canonical glyph inside the mounted %s status popup',
    async (appearance) => {
      let palette: ReturnType<typeof useTheme> | undefined;
      const CaptureTheme = () => {
        palette = useTheme();
        return null;
      };
      render(
        <ThemeProvider
          appearance={appearance}
          enableCustomFonts={false}
          theme={{ cssVar: { key: 'orvilo-vars' } }}
        >
          <CaptureTheme />
          <TaskProperties />
        </ThemeProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'taskDetail.workflow.category.backlog' }));
      const rows = await screen.findAllByRole('menuitem');
      const expected = [
        ['triage', palette!.orange],
        ['backlog', palette!.colorTextQuaternary],
        ['todo', palette!.colorTextTertiary],
        ['in_progress', palette!.colorWarning],
        ['in_review', palette!.colorSuccess],
        ['done', '#5e6ad2'],
        ['canceled', palette!.colorTextDescription],
      ] as const;
      expect(rows).toHaveLength(7);
      const normalize = (markup: string) => markup.replaceAll(/wf-knockout-[\w-]+/g, 'wf-knockout');
      rows.forEach((row, index) => {
        const [category, color] = expected[index];
        const icon = row.querySelector(`svg[data-workflow-icon="${category}"]`);
        expect(icon).toBeVisible();
        const reference = render(
          createElement(WORKFLOW_CATEGORY_VISUALS[category].icon, { color, size: 16 }),
        );
        expect(normalize(icon!.innerHTML)).toBe(
          normalize(reference.container.querySelector('svg')!.innerHTML),
        );
        reference.unmount();
      });
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

  it('reads local-only workflow references and renders every board-canonical menu icon', async () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    Object.assign(detail, {
      teamId: 'team-1',
      workflowCategory: 'in_progress',
      workflowStateId: null,
      workflowStateRefId: 'local-2',
    });
    mocks.teamStates = [
      {
        id: 'local-1',
        name: 'Ready',
        category: 'todo',
        position: 0,
        remoteStateId: null,
        teamId: 'team-1',
        workspaceId: 'workspace-1',
      },
      {
        id: 'local-3',
        name: 'Testing',
        category: 'in_progress',
        position: 3,
        remoteStateId: null,
        teamId: 'team-1',
        workspaceId: 'workspace-1',
      },
      {
        id: 'local-2',
        name: 'Implementing',
        category: 'in_progress',
        position: 2,
        remoteStateId: null,
        teamId: 'team-1',
        workspaceId: 'workspace-1',
      },
    ];
    try {
      render(<TaskProperties />);
      const trigger = screen.getByRole('button', { name: 'Implementing' });
      expect(trigger.querySelector('svg')).toHaveAttribute('data-workflow-icon', 'in_progress');
      fireEvent.click(trigger);
      const rows = await screen.findAllByRole('menuitem');
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Ready'),
        expect.stringContaining('Implementing'),
        expect.stringContaining('Testing'),
      ]);
      expect(
        rows.map((row) => row.querySelector('svg')?.getAttribute('data-workflow-icon')),
      ).toEqual(['todo', 'in_progress', 'in_progress']);
      fireEvent.click(rows[2]);
      await waitFor(() =>
        expect(mocks.moveWorkflow).toHaveBeenCalledWith({
          taskIdentifier: 'T-1',
          target: { category: 'in_progress', workflowStateRefId: 'local-3' },
        }),
      );
    } finally {
      delete detail.teamId;
      delete detail.workflowCategory;
      delete detail.workflowStateId;
      delete detail.workflowStateRefId;
    }
  });

  it('does not mistake an unlinked team task for the first null-provider state', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    Object.assign(detail, {
      teamId: 'team-1',
      workflowCategory: 'in_progress',
      workflowStateId: null,
      workflowStateRefId: null,
    });
    mocks.teamStates = [
      {
        id: 'local-1',
        name: 'Ready',
        category: 'todo',
        position: 0,
        remoteStateId: null,
        teamId: 'team-1',
        workspaceId: 'workspace-1',
      },
    ];
    try {
      render(<TaskProperties />);
      expect(
        screen.getByRole('button', { name: 'taskDetail.workflow.category.in_progress' }),
      ).toBeTruthy();
      expect(screen.queryByText('Ready')).toBeNull();
    } finally {
      delete detail.teamId;
      delete detail.workflowCategory;
      delete detail.workflowStateId;
      delete detail.workflowStateRefId;
    }
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
      expect(screen.queryByText('waiting')).toBeNull();
      expect(screen.getByText('taskDetail.workflow.category.backlog')).toBeTruthy();
      expect(screen.queryByText('running')).toBeNull();
    } finally {
      detail.status = 'backlog';
      delete detail.dispatchPhase;
      delete detail.workflowCategory;
    }
  });

  it('shows pending input before succeeded execution while preserving workflow and run truth', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    Object.assign(detail, {
      attentionReason: 'needs_input',
      dispatchPhase: 'succeeded',
      status: 'completed',
      workflowCategory: 'in_progress',
    });
    try {
      const { container } = render(<TaskProperties />);
      expect(screen.getByText('taskList.attention.needsInput')).toBeTruthy();
      expect(screen.queryByText('succeeded')).toBeNull();
      expect(container.querySelector('[data-task-execution-state]')).toBeNull();
      expect(screen.queryByText('taskDetail.workflow.category.in_progress')).toBeNull();
    } finally {
      delete detail.attentionReason;
      delete detail.dispatchPhase;
      delete detail.workflowCategory;
      detail.status = 'backlog';
    }
  });

  it('clears the attention label after input resolves without changing failed run history', () => {
    const { container, rerender } = render(
      <TaskExecutionBadge
        showLabel
        attentionReason="needs_input"
        runState="failed"
        status="completed"
      />,
    );
    expect(screen.getByText('taskList.attention.needsInput')).toBeTruthy();
    const failedGlyph = container.querySelector('svg')?.innerHTML;
    expect(container.querySelector('[data-task-execution-state="failed"]')).toBeTruthy();
    rerender(
      <TaskExecutionBadge showLabel attentionReason="none" runState="failed" status="completed" />,
    );
    expect(screen.queryByText('taskList.attention.needsInput')).toBeNull();
    expect(screen.getByText('failed')).toBeTruthy();
    expect(container.querySelector('svg')?.innerHTML).toBe(failedGlyph);
    rerender(
      <TaskExecutionBadge
        showLabel
        attentionReason="none"
        runState="succeeded"
        status="completed"
      />,
    );
    expect(screen.getByText('succeeded')).toBeTruthy();
    expect(screen.queryByText('taskList.attention.needsInput')).toBeNull();
  });

  it('fills the loaded no-execution property without changing compact badges or unknown state', () => {
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

  it('keeps the three narrow defaults and a real wide-only empty Labels picker', () => {
    const { container } = render(<TaskProperties />);
    expect(
      [...container.querySelectorAll('[data-task-property]')].map((row) =>
        row.getAttribute('data-task-property'),
      ),
    ).toEqual(['state', 'priority', 'assignee', 'labels']);
    for (const name of [
      'taskDetail.property.state',
      'taskDetail.property.priority',
      'taskDetail.assignee',
    ]) {
      expect(screen.getByRole('group', { name })).toBeTruthy();
      expect(screen.queryByText(name)).toBeNull();
    }
    expect(screen.getByText('taskDetail.property.addAssignee')).toBeTruthy();
    const assignee = screen.getByRole('group', { name: 'taskDetail.assignee' });
    expect(assignee.querySelector('svg.lucide-user-round')).toBeTruthy();
    expect(screen.queryByText(/^0$/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Executing Agent' })).toBeNull();
    expect(screen.queryByText('taskDetail.property.addDueDate')).toBeNull();
    expect(screen.getByText('taskDetail.property.addLabels')).toBeTruthy();
    expect(
      container.querySelector('[data-task-property="labels"]')?.getAttribute('data-wide-only'),
    ).toBe('true');
    expect(screen.queryByText('taskDetail.property.schedule')).toBeNull();
  });

  it('renders optional properties only while their values are configured', () => {
    const detail = (mocks.taskState.taskDetailMap as Record<string, Record<string, unknown>>)[
      'T-1'
    ];
    Object.assign(detail, {
      dueDate: '2026-10-15',
      labels: ['label-1'],
      automationMode: 'schedule',
      schedulePattern: '0 9 * * *',
      reviewerUserId: 'user-reviewer',
      agentId: 'agent-configured',
    });
    try {
      const { container, unmount } = render(<TaskProperties />);
      expect(
        [...container.querySelectorAll('[data-task-property]')].map((row) =>
          row.getAttribute('data-task-property'),
        ),
      ).toEqual(['state', 'priority', 'assignee', 'due-date', 'labels', 'reviewer', 'schedule']);
      expect(screen.getByRole('button', { name: 'Executing Agent' })).toBeTruthy();
      for (const field of [
        'dueDate',
        'automationMode',
        'schedulePattern',
        'reviewerUserId',
        'agentId',
      ])
        delete detail[field];
      detail.labels = [];
      unmount();
      const cleared = render(<TaskProperties />);
      expect(cleared.container.querySelectorAll('[data-task-property]')).toHaveLength(4);
      expect(
        cleared.container
          .querySelector('[data-task-property="labels"]')
          ?.getAttribute('data-wide-only'),
      ).toBe('true');
      expect(screen.queryByRole('button', { name: 'Executing Agent' })).toBeNull();
    } finally {
      for (const field of [
        'dueDate',
        'automationMode',
        'schedulePattern',
        'reviewerUserId',
        'agentId',
      ])
        delete detail[field];
      detail.labels = [];
    }
  });
});
