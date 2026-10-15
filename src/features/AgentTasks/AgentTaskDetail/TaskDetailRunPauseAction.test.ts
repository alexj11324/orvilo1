import type { TaskDetailData } from '@orvilo/types';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskStore } from '@/store/task';

import TaskDetailPage from './TaskDetailPage';
import TaskDetailRunPauseAction, {
  formatCountdown,
  shouldPersistFallbackAssignee,
} from './TaskDetailRunPauseAction';
import { TaskDetailScope } from './TaskDetailScope';
import TaskExecutionSection from './TaskExecutionSection';
import TaskScheduleConfig from './TaskScheduleConfig';

const api = vi.hoisted(() => ({
  access: { canUseResource: true, isAccessResolved: true },
  contractContext: vi.fn(),
  confirmModal: vi.fn((options: { onOk: () => void }) => options.onOk()),
  runMutation: vi.fn(),
  cancelOccurrence: vi.fn(),
  cancelTopic: vi.fn(),
  getIssuePlan: vi.fn(),
  updateStatus: vi.fn(),
  toastError: vi.fn(),
  canEdit: true,
}));

vi.mock('@/features/HeterogeneousAgent/builtinHarness', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBuiltinHarnessOffered: () => true,
}));
vi.mock('@/features/DefaultAgent/useFallbackAgentId', () => ({
  useFallbackAgentId: () => undefined,
}));
vi.mock('@/components/toast', () => ({ toast: { error: api.toastError } }));
vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    task: {
      contractContext: { query: api.contractContext },
      cancelAutomationOccurrence: { mutate: api.cancelOccurrence },
      cancelTopic: { mutate: api.cancelTopic },
      getIssuePlan: { query: api.getIssuePlan },
      updateStatus: { mutate: api.updateStatus },
      run: { mutate: api.runMutation },
    },
  },
}));
vi.mock('@/components/Modal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmModal: api.confirmModal,
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: api.canEdit }) }));
vi.mock('../features/ReviewerAgentSelector', () => ({
  ReviewerAgentSelector: ({
    currentAgentId,
    children,
  }: {
    currentAgentId?: string | null;
    children: ReactNode;
  }) =>
    createElement(
      'div',
      { 'data-testid': 'reviewer-picker', 'data-current-agent-id': currentAgentId ?? '' },
      children,
    ),
}));
vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: () => api.access,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}));
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
    api.canEdit = true;
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

  it.each([null, 'pi-reviewer'])(
    'shows review-required waiting with reviewer %s',
    (reviewerAgentId) => {
      seedTask({
        status: 'completed',
        dispatchPhase: 'succeeded',
        workflowCategory: 'in_review',
        parkedReason: 'review_required',
        reviewerAgentId,
        error: 'Reviewer cannot mount the acceptance submit tool',
      });
      renderExecution();

      expect(screen.getByRole('status')).toHaveTextContent('taskDetail.review.waitingReviewer');
      expect(
        screen.getByText('Reviewer cannot mount the acceptance submit tool'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('reviewer-picker')).toHaveAttribute(
        'data-current-agent-id',
        reviewerAgentId ?? '',
      );
      expect(
        screen.getByRole('button', {
          name: reviewerAgentId
            ? 'taskDetail.property.changeReviewer'
            : 'taskDetail.property.addReviewer',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('task-execution')).not.toBeInTheDocument();
      expect(api.runMutation).not.toHaveBeenCalled();
    },
  );

  it('keeps review-required waiting and its error visible without edit controls for read-only viewers', () => {
    api.canEdit = false;
    seedTask({
      parkedReason: 'review_required',
      reviewerAgentId: 'pi-reviewer',
      error: 'Reviewer cannot mount the acceptance submit tool',
    });
    renderExecution();
    expect(screen.getByRole('status')).toHaveTextContent('taskDetail.review.waitingReviewer');
    expect(
      screen.getByText('Reviewer cannot mount the acceptance submit tool'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

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
    api.canEdit = true;
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

describe('Stop current periodic occurrence', () => {
  it.each([
    { status: 'backlog', armed: false },
    { status: 'paused', armed: true },
  ] as const)(
    'offers first scheduling only for the unarmed $status heartbeat',
    async ({ status, armed }) => {
      seedTask({
        automationMode: 'heartbeat',
        context: armed ? { scheduler: { automationPaused: false, tickToken: 'pending-tick' } } : {},
        dispatchPhase: armed ? 'canceled' : null,
        heartbeat: { interval: 600 },
        status,
      });
      render(
        createElement(TaskDetailScope, {
          children: createElement(TaskScheduleConfig, { defaultOpen: true }),
          taskId: 'T-5',
        }),
      );
      await screen.findByText('taskSchedule.heading');
      if (armed) {
        expect(screen.queryByRole('button', { name: 'taskSchedule.startScheduling' })).toBeNull();
      } else {
        await userEvent.click(
          await screen.findByRole('button', { name: 'taskSchedule.startScheduling' }),
        );
        await waitFor(() =>
          expect(api.updateStatus).toHaveBeenCalledWith({ id: 'T-5', status: 'scheduled' }),
        );
      }
    },
  );

  it('keeps the future countdown after a manual heartbeat run stops', () => {
    seedTask({
      automationMode: 'heartbeat',
      context: { scheduler: { automationPaused: false, tickToken: 'pending-tick' } },
      dispatchPhase: 'canceled',
      heartbeat: { interval: 600, scheduledAt: new Date().toISOString() },
      status: 'paused',
    });
    render(
      createElement(TaskDetailScope, {
        children: createElement(TaskDetailRunPauseAction),
        taskId: 'T-5',
      }),
    );
    expect(screen.getByText('taskDetail.nextRunCountdown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'taskDetail.cancelSchedule' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'taskDetail.stopTask' })).toBeNull();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.canEdit = true;
    api.access = { canUseResource: true, isAccessResolved: true };
    api.getIssuePlan.mockResolvedValue({
      data: { automationQueue: { activeDispatchId: 'round-1' } },
    });
    api.cancelOccurrence.mockResolvedValue({ canceledDispatchId: 'round-1' });
    api.cancelTopic.mockResolvedValue({ success: true });
    api.updateStatus.mockResolvedValue({});
  });

  it.each(['schedule', 'heartbeat'] as const)(
    'stops the running %s occurrence through its cancellation API and refreshes after acknowledgement',
    async (automationMode) => {
      let acknowledge!: (value: { canceledDispatchId: string }) => void;
      api.cancelOccurrence.mockReturnValueOnce(
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
      );
      seedTask({ automationMode, dispatchPhase: 'running', status: 'running' });
      render(createElement(TaskDetailPage, { taskId: 'T-5' }));
      const stop = screen.getByRole('button', { name: 'taskDetail.stopTask' });
      await userEvent.click(stop);

      expect(api.getIssuePlan).toHaveBeenCalledWith({ id: 'T-5' });
      expect(api.cancelOccurrence).toHaveBeenCalledWith({ id: 'T-5' });
      expect(api.cancelTopic).not.toHaveBeenCalled();
      expect(api.updateStatus).not.toHaveBeenCalled();
      expect(stop).toBeDisabled();
      expect(useTaskStore.getState().internal_refreshTaskDetail).not.toHaveBeenCalled();
      expect(useTaskStore.getState().refreshTaskList).not.toHaveBeenCalled();
      expect(useTaskStore.getState().taskDetailMap['T-5']?.status).toBe('running');

      await act(async () => acknowledge({ canceledDispatchId: 'round-1' }));
      await waitFor(() => {
        expect(useTaskStore.getState().internal_refreshTaskDetail).toHaveBeenCalledWith('T-5');
        expect(useTaskStore.getState().refreshTaskList).toHaveBeenCalledOnce();
        expect(stop).toBeEnabled();
      });
      expect(api.toastError).not.toHaveBeenCalled();
    },
  );

  it('reports an unconfirmed native stop without pausing future scheduling or claiming success', async () => {
    const error = new Error('STOP_UNCONFIRMED');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.cancelOccurrence.mockRejectedValueOnce(error);
    seedTask({ automationMode: 'heartbeat', dispatchPhase: 'running', status: 'running' });
    render(createElement(TaskDetailPage, { taskId: 'T-5' }));
    await userEvent.click(screen.getByRole('button', { name: 'taskDetail.stopTask' }));

    await waitFor(() =>
      expect(api.toastError).toHaveBeenCalledWith('taskDetail.plan.stopRoundError'),
    );
    expect(api.updateStatus).not.toHaveBeenCalled();
    expect(api.cancelTopic).not.toHaveBeenCalled();
    expect(useTaskStore.getState().taskDetailMap['T-5']?.status).toBe('running');
    expect(useTaskStore.getState().internal_refreshTaskDetail).not.toHaveBeenCalled();
    expect(useTaskStore.getState().refreshTaskList).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'taskDetail.stopTask' })).toBeEnabled();
    expect(log).toHaveBeenCalledWith(expect.any(String), error);
    log.mockRestore();
  });

  it.each(['schedule', 'heartbeat'] as const)(
    'stops a manual %s run through its actual root-owned Topic',
    async (automationMode) => {
      api.getIssuePlan.mockResolvedValueOnce({ data: { automationQueue: {} } });
      seedTask({
        id: 'task-root',
        automationMode,
        status: 'running',
        activities: [
          { type: 'topic', status: 'running', id: 'child-topic', sourceTaskId: 'task-child' },
          { type: 'topic', status: 'completed', id: 'old-topic', sourceTaskId: 'task-root' },
          { type: 'topic', status: 'running', id: 'manual-topic', sourceTaskId: 'task-root' },
        ],
      });
      render(createElement(TaskDetailPage, { taskId: 'T-5' }));
      await userEvent.click(screen.getByRole('button', { name: 'taskDetail.stopTask' }));

      await waitFor(() =>
        expect(api.cancelTopic).toHaveBeenCalledWith({ topicId: 'manual-topic' }),
      );
      expect(api.cancelOccurrence).not.toHaveBeenCalled();
      expect(api.updateStatus).not.toHaveBeenCalled();
      expect(useTaskStore.getState().internal_refreshTaskDetail).toHaveBeenCalledWith('T-5');
      expect(useTaskStore.getState().refreshTaskList).toHaveBeenCalledOnce();
    },
  );

  it.each(['read', 'topic', 'missing', 'ambiguous'])(
    'reports a failed %s route without another cancellation or status write',
    async (failure) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      api.getIssuePlan.mockResolvedValueOnce({ data: { automationQueue: {} } });
      if (failure === 'read')
        api.getIssuePlan.mockReset().mockRejectedValue(new Error('Read failed'));
      if (failure === 'topic') api.cancelTopic.mockRejectedValueOnce(new Error('STOP_UNCONFIRMED'));
      seedTask({
        id: 'task-root',
        automationMode: 'heartbeat',
        status: 'running',
        activities:
          failure === 'missing'
            ? []
            : [
                { type: 'topic', status: 'running', id: 'manual-topic', sourceTaskId: 'task-root' },
                ...(failure === 'ambiguous'
                  ? [
                      {
                        type: 'topic' as const,
                        status: 'running',
                        id: 'other-topic',
                        sourceTaskId: 'task-root',
                      },
                    ]
                  : []),
              ],
      });
      render(createElement(TaskDetailPage, { taskId: 'T-5' }));
      await userEvent.click(screen.getByRole('button', { name: 'taskDetail.stopTask' }));

      await waitFor(() =>
        expect(api.toastError).toHaveBeenCalledWith('taskDetail.plan.stopRoundError'),
      );
      expect(api.cancelTopic).toHaveBeenCalledTimes(failure === 'topic' ? 1 : 0);
      expect(api.cancelOccurrence).not.toHaveBeenCalled();
      expect(api.updateStatus).not.toHaveBeenCalled();
      expect(useTaskStore.getState().taskDetailMap['T-5']?.status).toBe('running');
      expect(useTaskStore.getState().internal_refreshTaskDetail).not.toHaveBeenCalled();
      expect(useTaskStore.getState().refreshTaskList).not.toHaveBeenCalled();
      log.mockRestore();
    },
  );

  it('preserves an acknowledged stop when refreshing its detail fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Readback unavailable');
    seedTask({ automationMode: 'schedule', dispatchPhase: 'running', status: 'running' });
    vi.mocked(useTaskStore.getState().internal_refreshTaskDetail).mockRejectedValueOnce(error);
    render(createElement(TaskDetailPage, { taskId: 'T-5' }));
    await userEvent.click(screen.getByRole('button', { name: 'taskDetail.stopTask' }));

    await waitFor(() => expect(log).toHaveBeenCalledWith(expect.any(String), error));
    expect(api.cancelOccurrence).toHaveBeenCalledOnce();
    expect(api.cancelTopic).not.toHaveBeenCalled();
    expect(api.updateStatus).not.toHaveBeenCalled();
    expect(api.toastError).not.toHaveBeenCalled();
    expect(useTaskStore.getState().refreshTaskList).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'taskDetail.stopTask' })).toBeEnabled();
    log.mockRestore();
  });

  it('retains the ordinary one-off stop API', async () => {
    seedTask({ automationMode: null, dispatchPhase: 'running', status: 'running' });
    render(createElement(TaskDetailPage, { taskId: 'T-5' }));
    await userEvent.click(screen.getByRole('button', { name: 'taskDetail.stopTask' }));

    await waitFor(() =>
      expect(api.updateStatus).toHaveBeenCalledWith({ id: 'T-5', status: 'paused' }),
    );
    expect(api.cancelOccurrence).not.toHaveBeenCalled();
  });
});
