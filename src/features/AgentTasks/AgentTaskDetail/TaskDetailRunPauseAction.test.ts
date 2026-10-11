import type { TaskDetailData } from '@orvilo/types';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskStore } from '@/store/task';

import TaskDetailPage from './TaskDetailPage';
import { formatCountdown, shouldPersistFallbackAssignee } from './TaskDetailRunPauseAction';
import { TaskDetailScope } from './TaskDetailScope';
import TaskExecutionSection from './TaskExecutionSection';

const api = vi.hoisted(() => ({
  access: { canUseResource: true, isAccessResolved: true },
  contractContext: vi.fn(),
  confirmModal: vi.fn((options: { onOk: () => void }) => options.onOk()),
  runMutation: vi.fn(),
}));

vi.mock('@/features/DefaultAgent/useFallbackAgentId', () => ({
  useFallbackAgentId: () => undefined,
}));
vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    task: {
      contractContext: { query: api.contractContext },
      run: { mutate: api.runMutation },
    },
  },
}));
vi.mock('@/components/Modal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmModal: api.confirmModal,
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: () => api.access,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/agent', () => ({ useAgentStore: () => undefined }));
vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { toggleTaskAgentPanel: () => void }) => unknown) =>
    selector({ toggleTaskAgentPanel: () => {} }),
}));
vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: { showTaskAgentPanel: () => false },
}));
vi.mock('@/features/NavHeader', () => ({
  default: ({ left, right }: { left?: ReactNode; right?: ReactNode }) =>
    createElement('header', null, left, right),
}));
vi.mock('@/features/HomeSidebar/Body/WorkFavoriteButton', () => ({ default: () => null }));
vi.mock('@/features/RightPanel/ToggleRightPanelButton', () => ({ default: () => null }));
vi.mock('@/features/WorkSurface', () => ({
  WorkSurface: ({ children }: { children: ReactNode }) => createElement('main', null, children),
  WorkSurfaceDocument: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../shared/Breadcrumb', () => ({ default: () => null }));
vi.mock('./TaskDetailHeaderActions', () => ({ default: () => null }));
vi.mock('./IssueContent', () => ({ default: () => null }));
vi.mock('./TopicChatDrawer', () => ({ default: () => null }));
vi.mock('./useActiveTaskDetail', () => ({
  useActiveTaskDetail: () => ({ isNotFound: false, isInitialLoading: false, onRetry: () => {} }),
}));

afterEach(() => cleanup());

describe('formatCountdown', () => {
  it('keeps the precise countdown for durations shorter than one day', () => {
    expect(formatCountdown((23 * 3600 + 59 * 60 + 59) * 1000)).toEqual({
      countdown: '23:59:59',
      type: 'time',
    });
  });

  it('formats durations of at least one day as days and hours', () => {
    expect(formatCountdown((2 * 86_400 + 16 * 3600 + 55 * 60 + 28) * 1000)).toEqual({
      days: 2,
      hours: 16,
      type: 'days',
    });
  });

  it('clamps expired countdowns to zero', () => {
    expect(formatCountdown(-1000)).toEqual({ countdown: '00:00', type: 'time' });
  });
});

describe('shouldPersistFallbackAssignee', () => {
  it('uses the inbox agent only when the task has no assignee', () => {
    expect(shouldPersistFallbackAssignee(null, null, 'inbox-agent')).toBe(true);
    expect(shouldPersistFallbackAssignee('agent-1', null, 'inbox-agent')).toBe(false);
    expect(shouldPersistFallbackAssignee(null, 'user-1', 'inbox-agent')).toBe(false);
    expect(shouldPersistFallbackAssignee(null, null, null)).toBe(false);
  });
});

const failedTask = {
  identifier: 'T-5',
  instruction: 'Verify the recovered task',
  status: 'failed',
  agentId: 'journey-agent',
  dispatchPhase: 'failed',
  workflowCategory: 'in_progress',
  dependencies: [],
} satisfies TaskDetailData;

const seedTask = (patch: Partial<TaskDetailData> = {}) => {
  useTaskStore.setState({
    activeTaskId: 'T-6',
    taskDetailMap: { 'T-5': { ...failedTask, ...patch } },
    internal_refreshTaskDetail: vi.fn().mockResolvedValue(undefined),
    refreshTaskList: vi.fn().mockResolvedValue(undefined),
  });
};

const renderExecution = () =>
  render(
    createElement(TaskDetailScope, {
      children: createElement(TaskExecutionSection),
      taskId: 'T-5',
    }),
  );

// Starting, retrying and resuming moved out of the Issue header into the
// Execution area. Every one of them still takes the contract-checked run.
describe('Issue execution recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.access = { canUseResource: true, isAccessResolved: true };
    api.runMutation.mockResolvedValue({ success: true });
    seedTask();
  });

  it.each([
    {
      action: 'retry',
      name: 'a failed dispatch parked as paused',
      patch: { status: 'paused' },
      pendingConstraintEdits: false,
    },
    {
      action: 'retry',
      name: 'a failed run with pending contract edits',
      patch: { status: 'failed' },
      pendingConstraintEdits: true,
    },
    {
      action: 'resume',
      name: 'a stopped run',
      patch: { dispatchPhase: 'canceled', status: 'paused' },
      pendingConstraintEdits: true,
    },
    {
      action: 'start',
      name: 'an In Progress Issue that never ran',
      patch: { dispatchPhase: null, status: 'backlog' },
      pendingConstraintEdits: true,
    },
  ] as const)(
    'offers $action for $name through the contract check',
    async ({ action, patch, pendingConstraintEdits }) => {
      seedTask(patch);
      api.contractContext.mockResolvedValue({
        data: { pendingConstraintEdits, contract: { revision: 2 } },
      });
      renderExecution();
      await userEvent.click(
        await screen.findByRole('button', { name: `taskDetail.execution.action.${action}` }),
      );

      expect(api.contractContext).toHaveBeenCalledWith({ id: 'T-5' });
      await waitFor(() => expect(api.runMutation).toHaveBeenCalledTimes(1));
      expect(api.runMutation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'T-5', idempotencyKey: expect.any(String) }),
      );
      expect(api.runMutation.mock.calls[0][0].intent).toBe(
        pendingConstraintEdits ? 'repair' : undefined,
      );
      expect(api.confirmModal).toHaveBeenCalledTimes(pendingConstraintEdits ? 1 : 0);
    },
  );

  it('does not run when the pending-contract-edits confirmation is declined', async () => {
    api.contractContext.mockResolvedValue({
      data: { pendingConstraintEdits: true, contract: { revision: 2 } },
    });
    api.confirmModal.mockImplementationOnce(((options: { onCancel: () => void }) =>
      options.onCancel()) as never);
    renderExecution();
    await userEvent.click(
      await screen.findByRole('button', { name: 'taskDetail.execution.action.retry' }),
    );

    await waitFor(() => expect(api.confirmModal).toHaveBeenCalledTimes(1));
    expect(api.runMutation).not.toHaveBeenCalled();
  });

  it('holds the action while prerequisites are unfinished', async () => {
    seedTask({ dependencies: [{ dependsOn: 'T-1', status: 'backlog', type: 'blocks' }] });
    renderExecution();

    const retry = await screen.findByRole('button', { name: 'taskDetail.execution.action.retry' });
    expect(retry).toBeDisabled();
  });

  // A disabled button shows no tooltip, so the reason has to be on the page.
  it('writes out why the action is unavailable when the viewer may not run the agent', async () => {
    api.access = { canUseResource: false, isAccessResolved: true };
    seedTask();
    renderExecution();

    const retry = await screen.findByRole('button', { name: 'taskDetail.execution.action.retry' });
    expect(retry).toBeDisabled();
    expect(screen.getByText('taskDetail.execution.noAgentAccess')).toBeInTheDocument();
  });

  it('does not claim a refusal while agent access is still loading', async () => {
    api.access = { canUseResource: false, isAccessResolved: false };
    seedTask();
    renderExecution();

    const retry = await screen.findByRole('button', { name: 'taskDetail.execution.action.retry' });
    expect(retry).toBeDisabled();
    expect(screen.queryByText('taskDetail.execution.noAgentAccess')).not.toBeInTheDocument();
  });
});

describe('Issue header run control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedTask();
  });

  it.each(['failed', 'paused', 'backlog', 'completed'])(
    'offers no way to start a %s Issue from the header',
    (status) => {
      seedTask({ status });
      render(createElement(TaskDetailPage, { taskId: 'T-5' }));

      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('keeps Stop in the header while a run is in progress', () => {
    seedTask({ dispatchPhase: 'running', status: 'running' });
    render(createElement(TaskDetailPage, { taskId: 'T-5' }));

    expect(screen.getByRole('button', { name: 'taskDetail.stopTask' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'taskDetail.runTask' })).toBeNull();
  });

  it('keeps the schedule control in the header for a scheduled Issue', () => {
    seedTask({ automationMode: 'schedule', dispatchPhase: null, status: 'scheduled' });
    render(createElement(TaskDetailPage, { taskId: 'T-5' }));

    expect(screen.getByRole('button', { name: 'taskDetail.cancelSchedule' })).toBeTruthy();
  });
});
