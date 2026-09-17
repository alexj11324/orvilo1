// @vitest-environment node
import { DEFAULT_BRIEF_ACTIONS, type TaskItem } from '@orvilo/types';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { TaskDependencyError } from '@/database/models/taskDependency';

import { TaskLifecycleService } from './index';

const fakeScheduler = {
  cancelScheduled: vi.fn().mockResolvedValue(undefined),
  scheduleNextTopic: vi.fn().mockResolvedValue('msg-new'),
};

const {
  captureRemoteIdentityOnComplete,
  cascadeOnCompletion,
  deferredVerifyDrive,
  integrateOnComplete,
  runTaskMock,
  settleDispatch,
} = vi.hoisted(() => ({
  captureRemoteIdentityOnComplete: vi.fn().mockResolvedValue(true),
  cascadeOnCompletion: vi.fn().mockResolvedValue({ failed: [], paused: [], started: [] }),
  deferredVerifyDrive: vi.fn().mockResolvedValue(undefined),
  integrateOnComplete: vi.fn().mockResolvedValue('settled'),
  runTaskMock: vi.fn().mockResolvedValue({ success: true }),
  settleDispatch: vi.fn().mockResolvedValue({ currentContract: true, currentGeneration: true }),
}));

vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: vi.fn(function () {
    return { settle: settleDispatch };
  }),
}));

vi.mock('@/server/services/verify/settle', () => ({ driveTaskFromVerify: deferredVerifyDrive }));

vi.mock('@/server/services/taskIntegration', () => ({
  TaskIntegrationService: vi.fn(function () {
    return { captureRemoteIdentityOnComplete, integrateOnComplete };
  }),
}));

// The error brief only grows an "Upgrade plan" remedy when the distribution
// configures a subscription page; the real branding has none. BRANDING_URL is
// mocked with a mutable object so the two branches of that guard can both be
// asserted: the default (undefined) one against the shipped config, and the
// configured one by injecting a URL for the length of a single test.
const { mockBrandingUrl } = vi.hoisted(() => ({
  mockBrandingUrl: {
    help: undefined,
    privacy: undefined,
    subscription: undefined,
    support: undefined,
    terms: undefined,
  } as Record<'help' | 'privacy' | 'subscription' | 'support' | 'terms', string | undefined>,
}));

vi.mock('@orvilo/business-const', async (importOriginal) => ({
  ...((await importOriginal()) as any),
  BRANDING_URL: mockBrandingUrl,
}));

vi.mock('@/server/services/taskRunner', () => ({
  TaskRunnerService: vi.fn(function () {
    return { cascadeOnCompletion, runTask: runTaskMock };
  }),
}));

vi.mock('@/server/services/taskScheduler', () => ({
  createTaskSchedulerModule: () => fakeScheduler,
}));

// onTopicComplete reads the op's verify run to decide whether to "let go" for
// async Verify-driven completion. Mock it; default = no verify run.
const verifyFindByOperation = vi.fn().mockResolvedValue(undefined);
vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return { findByOperation: verifyFindByOperation };
  }),
}));

// Goal-loop rounds suppress the per-topic brief; onTopicComplete asks the
// goals table whether this task carries a goal. Default = plain task.
const goalFindByGraphTask = vi.fn().mockResolvedValue(undefined);
vi.mock('@/database/models/goal', () => ({
  GoalModel: vi.fn(function () {
    return { findByGraphTask: goalFindByGraphTask };
  }),
}));

// Error-brief copy is localized at the source via the server translator; mock it
// with a tiny table so the error-branch tests can assert both the friendly-copy
// mapping (a known error code → its human message) and the raw-message fallback
// (unknown code → the key is returned unchanged, so the code falls back).
const FAKE_MESSAGES: Record<string, string> = {
  'response.InsufficientBudgetForModel': 'Not enough credits — top up or upgrade to continue.',
};
vi.mock('@/libs/i18n/serverTranslation', () => ({
  translation: async () => ({ t: (key: string) => FAKE_MESSAGES[key] ?? key }),
}));

// Scheduled-task result notifications go through the `@/business` slot
// (default impl is a no-op). Mock both hooks so the tests can assert exactly
// when the lifecycle recalls the user.
const notifyCompleted = vi.fn().mockResolvedValue(undefined);
const notifyFailed = vi.fn().mockResolvedValue(undefined);
vi.mock('@/business/server/task/notifyScheduledTaskResult', () => ({
  notifyScheduledTaskCompleted: (...args: unknown[]) => notifyCompleted(...args),
  notifyScheduledTaskFailed: (...args: unknown[]) => notifyFailed(...args),
}));

const baseTask = (overrides: Partial<TaskItem> = {}): TaskItem =>
  ({
    automationMode: 'heartbeat',
    config: {},
    context: {},
    error: null,
    heartbeatInterval: 30,
    heartbeatTimeout: 600,
    id: 'task-1',
    identifier: 'TASK-1',
    instruction: 'do the thing',
    name: 'demo',
    status: 'running',
    ...overrides,
  }) as unknown as TaskItem;

describe('TaskLifecycleService.onTopicComplete', () => {
  let service: TaskLifecycleService;
  type AnyMock = Mock<(...args: unknown[]) => unknown>;
  let updateStatus: AnyMock;
  let updateStatusIfCurrent: AnyMock;
  let updateContext: AnyMock;
  let findById: AnyMock;
  let updateHeartbeat: AnyMock;
  let updateTopicStatus: AnyMock;
  let settleHistoricalRun: AnyMock;
  let createBrief: AnyMock;
  let getReviewConfig: AnyMock;

  const lastCreatedBrief = () =>
    createBrief.mock.calls.at(-1)?.[0] as {
      actions: Array<{ key: string; label?: string; type?: string; url?: string }>;
      metadata?: unknown;
      summary: string;
      title: string;
      topicId?: string;
    };

  beforeEach(() => {
    fakeScheduler.scheduleNextTopic.mockClear().mockResolvedValue('msg-new');
    notifyCompleted.mockReset().mockResolvedValue(undefined);
    notifyFailed.mockReset().mockResolvedValue(undefined);
    cascadeOnCompletion.mockReset().mockResolvedValue({ failed: [], paused: [], started: [] });
    deferredVerifyDrive.mockReset().mockResolvedValue(undefined);
    captureRemoteIdentityOnComplete.mockReset().mockResolvedValue(true);
    integrateOnComplete.mockReset().mockResolvedValue('settled');
    settleDispatch
      .mockReset()
      .mockResolvedValue({ currentContract: true, currentGeneration: true, state: 'settled' });

    service = new TaskLifecycleService({} as any, 'user-1');

    updateStatus = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(null);
    updateStatusIfCurrent = vi.fn<(...args: unknown[]) => unknown>();
    updateContext = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(null);
    findById = vi.fn<(...args: unknown[]) => unknown>();
    updateHeartbeat = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(undefined);
    updateTopicStatus = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(undefined);
    settleHistoricalRun = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(true);
    createBrief = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(undefined);
    getReviewConfig = vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(undefined);
    verifyFindByOperation.mockReset().mockResolvedValue(undefined);

    const taskModel = (service as any).taskModel;
    taskModel.updateStatus = updateStatus;
    taskModel.updateStatusIfCurrent = updateStatusIfCurrent;
    taskModel.updateStatusIfReservation = vi.fn(
      async (_taskId, _reservationId, currentStatus, status, extra) => {
        await updateStatus(_taskId, status, extra);
        const conditional = await updateStatusIfCurrent(_taskId, currentStatus, status, extra);
        return conditional === undefined ? { id: _taskId, status } : conditional;
      },
    );
    taskModel.updateContext = updateContext;
    taskModel.updateContextIfReservation = vi.fn(async (_taskId, _reservationId, partial) => {
      await updateContext(_taskId, partial);
      return true;
    });
    taskModel.updateContextIfStatus = vi.fn(async (_taskId, _status, partial) => {
      await updateContext(_taskId, partial);
      return true;
    });
    taskModel.findById = findById;
    taskModel.releaseRunReservation = vi.fn().mockResolvedValue(true);
    taskModel.getReviewConfig = getReviewConfig;
    taskModel.getCheckpointConfig = vi.fn().mockReturnValue({});
    // Default checkpoint behavior: pause after topic complete
    taskModel.shouldPauseOnTopicComplete = vi.fn().mockReturnValue(true);
    // The late-steer probe reads the topic spine tail; default to "no tail
    // message" so the probe is a no-op unless a test stages a steer row.
    (service as any).messageModel = {
      findById: vi.fn().mockResolvedValue(undefined),
      getLatestSpineMessageId: vi.fn().mockResolvedValue(undefined),
    };
    runTaskMock.mockReset().mockResolvedValue({ success: true });
    // Avoid generateHandoff side effects by skipping when lastAssistantContent is undefined
    (service as any).taskTopicModel.settleIfRunning =
      updateTopicStatus.mockResolvedValue('completion:op-1');
    (service as any).taskTopicModel.updateStatus = updateTopicStatus;
    (service as any).taskTopicModel.settleHistoricalRun = settleHistoricalRun;
    (service as any).taskTopicModel.findByTopicId = vi.fn().mockResolvedValue({
      integration: undefined,
      topicId: 'topic-1',
    });
    (service as any).taskTopicModel.updateHandoffContent = vi.fn().mockResolvedValue(undefined);
    (service as any).briefModel.create = createBrief;
    (service as any).briefModel.hasUnresolvedUrgentByTask = vi.fn().mockResolvedValue(false);
    // The error branch resolves the user's locale for brief copy.
    (service as any).systemAgentService.getUserLocale = vi.fn().mockResolvedValue('en-US');
  });

  afterEach(() => {
    mockBrandingUrl.subscription = undefined;
    vi.restoreAllMocks();
  });

  describe('reopened prerequisite during completion', () => {
    it('parks the settled run and releases only its completion lease', async () => {
      findById.mockResolvedValue(baseTask({ parentTaskId: 'parent', automationMode: null }));
      const model = (service as any).taskModel;
      model.updateStatusIfReservation
        .mockRejectedValueOnce(new TaskDependencyError('Reopened', 'PRECONDITION_FAILED'))
        .mockResolvedValueOnce({ id: 'task-1', status: 'paused' });
      await expect(
        service.onTopicComplete({
          operationId: 'op-1',
          reason: 'done',
          taskId: 'task-1',
          taskIdentifier: 'TASK-1',
          topicId: 'topic-1',
        }),
      ).resolves.toBeUndefined();
      expect(model.updateStatusIfReservation).toHaveBeenLastCalledWith(
        'task-1',
        'completion:op-1',
        'running',
        'paused',
        { error: expect.stringContaining('prerequisite') },
      );
      expect(model.releaseRunReservation).toHaveBeenCalledWith('task-1', 'completion:op-1');
      expect(cascadeOnCompletion).not.toHaveBeenCalled();
      expect(fakeScheduler.scheduleNextTopic).not.toHaveBeenCalled();
    });

    it('preserves the lease for retry if the recovery write itself fails', async () => {
      findById.mockResolvedValue(baseTask({ parentTaskId: 'parent', automationMode: null }));
      const model = (service as any).taskModel;
      model.updateStatusIfReservation
        .mockRejectedValueOnce(new TaskDependencyError('Reopened', 'PRECONDITION_FAILED'))
        .mockRejectedValueOnce(new Error('database unavailable'));
      await expect(
        service.onTopicComplete({
          operationId: 'op-1',
          reason: 'done',
          taskId: 'task-1',
          taskIdentifier: 'TASK-1',
          topicId: 'topic-1',
        }),
      ).rejects.toThrow('database unavailable');
      expect(model.releaseRunReservation).not.toHaveBeenCalled();
    });
  });

  describe('reason=done', () => {
    it('holds the lifecycle while workspace integration is still active', async () => {
      const task = baseTask({ automationMode: 'heartbeat' });
      findById.mockResolvedValue(task);
      integrateOnComplete.mockResolvedValueOnce('hold');

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).not.toHaveBeenCalled();
      expect(fakeScheduler.scheduleNextTopic).not.toHaveBeenCalled();
    });

    it('pauses the task when workspace integration blocks', async () => {
      const task = baseTask({ automationMode: 'heartbeat' });
      findById.mockResolvedValue(task);
      integrateOnComplete.mockResolvedValueOnce('blocked');

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', {
        error: 'Workspace merge could not be completed',
      });
      expect(fakeScheduler.scheduleNextTopic).not.toHaveBeenCalled();
    });

    it('archives a stale generation result without advancing the current task', async () => {
      settleDispatch.mockResolvedValue({
        currentContract: false,
        currentGeneration: false,
        state: 'settled',
      });

      await service.onTopicComplete({
        dispatchFence: 3,
        dispatchId: 'dispatch-old',
        executionGeneration: 7,
        lastAssistantContent: 'Historical result',
        operationId: 'op-old',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-old',
      });

      expect(settleDispatch).toHaveBeenCalledWith({
        dispatchId: 'dispatch-old',
        expected: ['dispatched', 'running', 'cancel_requested', 'outcome_unknown'],
        fence: 3,
        generation: 7,
        operationId: 'op-old',
        phase: 'succeeded',
      });
      expect(settleHistoricalRun).toHaveBeenCalledWith(
        'task-1',
        'topic-old',
        { dispatchId: 'dispatch-old', fence: 3, generation: 7 },
        'completed',
        'Historical result',
      );
      expect(updateTopicStatus).not.toHaveBeenCalled();
      expect(updateHeartbeat).not.toHaveBeenCalled();
      expect(findById).not.toHaveBeenCalled();
      expect(updateStatus).not.toHaveBeenCalled();
      expect(updateStatusIfCurrent).not.toHaveBeenCalled();
      expect(cascadeOnCompletion).not.toHaveBeenCalled();
    });

    it('ignores a replay after the dispatch already reached a terminal phase', async () => {
      settleDispatch.mockResolvedValue({ currentGeneration: true, state: 'already_settled' });

      await service.onTopicComplete({
        dispatchFence: 3,
        dispatchId: 'dispatch-complete',
        executionGeneration: 7,
        operationId: 'op-complete',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-complete',
      });

      expect(updateTopicStatus).not.toHaveBeenCalled();
      expect(updateHeartbeat).not.toHaveBeenCalled();
      expect(findById).not.toHaveBeenCalled();
      expect(createBrief).not.toHaveBeenCalled();
    });

    it('automation task → status="scheduled" (not paused)', async () => {
      const task = baseTask({ automationMode: 'heartbeat' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: null });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
    });

    it('reclaims a scheduled completion lease with a scheduled CAS guard', async () => {
      const task = baseTask({ automationMode: 'heartbeat', status: 'scheduled' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatusIfCurrent).toHaveBeenCalledWith('task-1', 'scheduled', 'scheduled', {
        error: null,
      });
    });

    it.each(['max_steps', 'cost_limit'])('%s is a successful task completion', async (reason) => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason,
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateTopicStatus).toHaveBeenCalledWith('task-1', 'topic-1', 'op-1', 'completed');
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', { error: null });
    });

    it('persists the run last message independently of handoff summary', async () => {
      const task = baseTask({ automationMode: 'heartbeat' });
      findById.mockResolvedValue(task);
      // Model the summary path as a no-op (e.g. its LLM call failed and was
      // swallowed) — the raw last message must still be persisted for the card.
      vi.spyOn(service as any, 'generateHandoff').mockResolvedValue(undefined);
      const updateHandoffContent = (service as any).taskTopicModel.updateHandoffContent;

      await service.onTopicComplete({
        lastAssistantContent: 'the raw last assistant message',
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateHandoffContent).toHaveBeenCalledWith(
        'task-1',
        'topic-1',
        'the raw last assistant message',
      );
    });

    it('retains the completion lease when lifecycle processing throws so delivery can retry', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      vi.spyOn(service as any, 'generateHandoff').mockRejectedValue(new Error('process crashed'));

      await expect(
        service.onTopicComplete({
          lastAssistantContent: 'substantive output',
          operationId: 'op-1',
          reason: 'done',
          taskId: 'task-1',
          taskIdentifier: 'TASK-1',
          topicId: 'topic-1',
        }),
      ).rejects.toThrow('process crashed');

      expect((service as any).taskModel.releaseRunReservation).not.toHaveBeenCalled();
    });

    it('schedule-mode task → status="scheduled"', async () => {
      const task = baseTask({ automationMode: 'schedule' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: null });
    });

    it('schedule-mode task under maxExecutions still parks at "scheduled"', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        config: { schedule: { maxExecutions: 10 } } as any,
        context: {
          scheduler: { scheduleStartedAt: new Date('2026-05-01T00:00:00Z').toISOString() },
        } as any,
      });
      findById.mockResolvedValue(task);
      (service as any).taskTopicModel.countByTask = vi.fn().mockResolvedValue(3);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: null });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'completed', expect.anything());
    });

    it('schedule-mode task at maxExecutions parks at "completed" instead of "scheduled"', async () => {
      // The reviewer-flagged P2 case: a daily cron with maxExecutions=1
      // would otherwise sit in `scheduled` for 24h after the only allowed
      // tick before the next pre-tick check noticed the cap.
      const task = baseTask({
        automationMode: 'schedule',
        config: { schedule: { maxExecutions: 1 } } as any,
        context: {
          scheduler: { scheduleStartedAt: new Date('2026-05-01T00:00:00Z').toISOString() },
        } as any,
      });
      findById.mockResolvedValue(task);
      (service as any).taskTopicModel.countByTask = vi.fn().mockResolvedValue(1);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'completed', {
        completedAt: expect.any(Date),
      });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'scheduled', expect.anything());
    });

    it('keeps a capped schedule task pending until its confirmed Verify run settles', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        config: { schedule: { maxExecutions: 1 } } as any,
        context: {
          scheduler: { scheduleStartedAt: new Date('2026-05-01T00:00:00Z').toISOString() },
        } as any,
      });
      findById.mockResolvedValue(task);
      (service as any).taskTopicModel.countByTask = vi.fn().mockResolvedValue(1);
      verifyFindByOperation.mockResolvedValue({ planConfirmedAt: new Date(), status: 'running' });

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: null });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'completed', expect.anything());
      expect((service as any).taskModel.releaseRunReservation).not.toHaveBeenCalled();
    });

    it('schedule-mode task with no scheduleStartedAt (pre-PR) still parks at "scheduled"', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        config: { schedule: { maxExecutions: 1 } } as any,
        context: {} as any,
      });
      findById.mockResolvedValue(task);
      const countByTask = vi.fn().mockResolvedValue(99);
      (service as any).taskTopicModel.countByTask = countByTask;

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      // Without scheduleStartedAt the helper short-circuits before querying,
      // and the task falls through to the normal scheduled-park branch.
      expect(countByTask).not.toHaveBeenCalled();
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: null });
    });

    it('non-automation task with default checkpoint → status="paused" (legacy behavior)', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', { error: null });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'scheduled', expect.anything());
    });

    it('continues the topic off a tail steer the finished run never consumed', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      const messageModel = (service as any).messageModel;
      messageModel.getLatestSpineMessageId.mockResolvedValue('msg-steer');
      messageModel.findById.mockResolvedValue({
        id: 'msg-steer',
        metadata: { steer: true },
        role: 'user',
      });

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(runTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          continueFromMessageId: 'msg-steer',
          continueTopicId: 'topic-1',
          idempotencyKey: 'steer:task-1:topic:topic-1:message:msg-steer',
          taskId: 'task-1',
        }),
      );
      expect(integrateOnComplete).not.toHaveBeenCalled();
      // The continuation owns the lifecycle — parking for review is skipped.
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
    });

    it('parks normally when the tail steer was already consumed mid-run', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      const messageModel = (service as any).messageModel;
      messageModel.getLatestSpineMessageId.mockResolvedValue('msg-steer');
      messageModel.findById.mockResolvedValue({
        id: 'msg-steer',
        metadata: { steer: true, steerConsumedBy: 'op-1' },
        role: 'user',
      });

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(runTaskMock).not.toHaveBeenCalled();
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', { error: null });
    });

    it('lets a verify-bound settle own the transition instead of steering', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      verifyFindByOperation.mockResolvedValue({ planConfirmedAt: new Date() });
      const messageModel = (service as any).messageModel;
      messageModel.getLatestSpineMessageId.mockResolvedValue('msg-steer');
      messageModel.findById.mockResolvedValue({
        id: 'msg-steer',
        metadata: { steer: true },
        role: 'user',
      });

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(runTaskMock).not.toHaveBeenCalled();
    });

    it('still parks when the late-steer continuation cannot start', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      const messageModel = (service as any).messageModel;
      messageModel.getLatestSpineMessageId.mockResolvedValue('msg-steer');
      messageModel.findById.mockResolvedValue({
        id: 'msg-steer',
        metadata: { steer: true },
        role: 'user',
      });
      runTaskMock.mockRejectedValue(new Error('runner unavailable'));

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', { error: null });
    });

    it('finalizes a current-operation completion request after the topic completes', async () => {
      const task = baseTask({
        automationMode: null,
        context: { completion: { requestedByOperationId: 'op-1' } },
      });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatusIfCurrent).toHaveBeenCalledWith('task-1', 'running', 'completed', {
        completedAt: expect.any(Date),
        error: null,
      });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
    });

    it('successful subtask → completes and unlocks downstream tasks instead of pausing', async () => {
      const task = baseTask({ automationMode: null, parentTaskId: 'parent-task' });
      const parentTask = baseTask({ id: 'parent-task', identifier: 'TASK-0' });
      updateStatusIfCurrent.mockResolvedValue(task);
      findById
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(parentTask)
        .mockResolvedValue(task);
      (service as any).taskModel.shouldPauseAfterComplete = vi.fn().mockReturnValue(false);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatusIfCurrent).toHaveBeenCalledWith('task-1', 'running', 'completed', {
        completedAt: expect.any(Date),
        error: null,
      });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
      expect(cascadeOnCompletion).toHaveBeenCalledWith('task-1');
    });

    it('successful subtask still honors an explicit parent after-completion checkpoint', async () => {
      const task = baseTask({ automationMode: null, parentTaskId: 'parent-task' });
      const parentTask = baseTask({ id: 'parent-task', identifier: 'TASK-0' });
      updateStatusIfCurrent.mockResolvedValue(task);
      findById
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(parentTask)
        .mockResolvedValue(task);
      (service as any).taskModel.shouldPauseAfterComplete = vi.fn().mockReturnValue(true);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatusIfCurrent).toHaveBeenCalledWith('task-1', 'running', 'completed', {
        completedAt: expect.any(Date),
        error: null,
      });
      expect(updateStatus).toHaveBeenCalledWith('parent-task', 'paused');
      expect(cascadeOnCompletion).toHaveBeenCalledWith('task-1');
    });

    it('successful subtask with an explicit topic-after checkpoint → pauses for review', async () => {
      const task = baseTask({ automationMode: null, parentTaskId: 'parent-task' });
      findById.mockResolvedValue(task);
      (service as any).taskModel.getCheckpointConfig = vi
        .fn()
        .mockReturnValue({ topic: { after: true } });

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatusIfCurrent).toHaveBeenCalledWith('task-1', 'running', 'paused', {
        error: null,
      });
      expect(cascadeOnCompletion).not.toHaveBeenCalled();
    });

    it('late successful callback does not overwrite a child that is no longer running', async () => {
      const task = baseTask({ automationMode: null, parentTaskId: 'parent-task' });
      findById.mockResolvedValue(task);
      updateStatusIfCurrent.mockResolvedValue(null);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatusIfCurrent).toHaveBeenCalledWith('task-1', 'running', 'completed', {
        completedAt: expect.any(Date),
        error: null,
      });
      expect(cascadeOnCompletion).not.toHaveBeenCalled();
    });

    it('ignores a callback after the task moved to another topic generation', async () => {
      findById.mockResolvedValue(
        baseTask({ automationMode: null, currentTopicId: 'topic-current' }),
      );
      updateTopicStatus.mockResolvedValue(false);

      await service.onTopicComplete({
        operationId: 'op-old',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-old',
      });

      expect(updateTopicStatus).toHaveBeenCalledWith('task-1', 'topic-old', 'op-old', 'completed');
      expect(integrateOnComplete).not.toHaveBeenCalled();
      expect(updateStatus).not.toHaveBeenCalled();
    });

    it('runs terminal side effects only for the callback that claims the topic', async () => {
      findById.mockResolvedValue(baseTask({ automationMode: null }));
      updateTopicStatus.mockResolvedValue(false);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(integrateOnComplete).not.toHaveBeenCalled();
      expect(updateStatus).not.toHaveBeenCalled();
    });

    it('non-automation task with shouldPauseOnTopicComplete=false → no status update', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      (service as any).taskModel.shouldPauseOnTopicComplete = vi.fn().mockReturnValue(false);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).not.toHaveBeenCalled();
    });

    it('goal-owned root task completes instead of remaining running', async () => {
      const task = baseTask({ automationMode: null, parentTaskId: null });
      findById.mockResolvedValue(task);
      (service as any).taskModel.shouldPauseOnTopicComplete = vi.fn().mockReturnValue(false);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        runTrigger: 'goal',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatusIfCurrent).toHaveBeenCalledWith('task-1', 'running', 'completed', {
        completedAt: expect.any(Date),
        error: null,
      });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
    });
  });

  describe('reason=done with brief.mode', () => {
    it('calls synthesizeTopicBrief by default (auto mode) when content is substantive', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      const synthesize = vi
        .spyOn(service as any, 'synthesizeTopicBrief')
        .mockResolvedValue(undefined);
      vi.spyOn(service as any, 'generateHandoff').mockResolvedValue(undefined);

      await service.onTopicComplete({
        lastAssistantContent:
          'I have completed the analysis and produced a multi-page report covering all sections.',
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(synthesize).toHaveBeenCalledTimes(1);
    });

    it('does not call synthesizeTopicBrief when brief.mode=agent (legacy escape hatch)', async () => {
      const task = baseTask({
        automationMode: null,
        config: { brief: { mode: 'agent' } },
      });
      findById.mockResolvedValue(task);
      const synthesize = vi
        .spyOn(service as any, 'synthesizeTopicBrief')
        .mockResolvedValue(undefined);
      vi.spyOn(service as any, 'generateHandoff').mockResolvedValue(undefined);

      await service.onTopicComplete({
        lastAssistantContent: 'enough content to count as substantive output',
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(synthesize).not.toHaveBeenCalled();
    });

    it('verify-bound task → does NOT pause-for-review (lets Verify drive completion async)', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      // A confirmed verify run exists for this op → onTopicComplete "lets go".
      verifyFindByOperation.mockResolvedValue({ planConfirmedAt: new Date() });
      vi.spyOn(service as any, 'synthesizeTopicBrief').mockResolvedValue(undefined);
      vi.spyOn(service as any, 'generateHandoff').mockResolvedValue(undefined);
      const bridge = vi.spyOn(service as any, 'bridgeResultToCreator').mockResolvedValue(undefined);

      await service.onTopicComplete({
        lastAssistantContent: 'enough content to count as substantive output',
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      // Did not pause — driveTaskFromVerify will complete/pause the task on settle.
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
      // The creator callback is DEFERRED to the verify settle path, not fired here.
      expect(bridge).not.toHaveBeenCalled();
      // The completion lease fences this generation until Verify settles.
      expect((service as any).taskModel.releaseRunReservation).not.toHaveBeenCalled();
    });

    it('does not re-arm a verify-bound heartbeat before Verify releases the lease', async () => {
      const task = baseTask({ automationMode: 'heartbeat', status: 'running' });
      findById.mockResolvedValue(task);
      verifyFindByOperation.mockResolvedValue({ planConfirmedAt: new Date(), status: 'running' });

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        runTrigger: 'heartbeat',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: null });
      expect(fakeScheduler.scheduleNextTopic).not.toHaveBeenCalled();
      expect((service as any).taskModel.releaseRunReservation).not.toHaveBeenCalled();
    });

    it('does not re-arm a heartbeat that a user paused while Verify settled', async () => {
      findById.mockResolvedValue(baseTask({ automationMode: 'heartbeat', status: 'paused' }));

      await service.rearmHeartbeatAfterVerify('task-1');

      expect(fakeScheduler.scheduleNextTopic).not.toHaveBeenCalled();
    });

    it('stops lifecycle side effects when a user supersedes the completion lease', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      const bridge = vi.spyOn(service as any, 'bridgeResultToCreator').mockResolvedValue(undefined);
      (service as any).taskModel.updateStatusIfReservation.mockResolvedValueOnce(null);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(bridge).not.toHaveBeenCalled();
      expect(fakeScheduler.scheduleNextTopic).not.toHaveBeenCalled();
    });

    it('drives a Verify verdict that settled before the topic callback', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      verifyFindByOperation.mockResolvedValue({
        planConfirmedAt: new Date(),
        status: 'passed',
      });
      vi.spyOn(service as any, 'synthesizeTopicBrief').mockResolvedValue(undefined);
      vi.spyOn(service as any, 'generateHandoff').mockResolvedValue(undefined);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(deferredVerifyDrive).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'op-1',
        undefined,
      );
    });

    it('non-verify-bound task → fires the creator callback at onTopicComplete', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      verifyFindByOperation.mockResolvedValue(undefined); // no verify run
      vi.spyOn(service as any, 'synthesizeTopicBrief').mockResolvedValue(undefined);
      vi.spyOn(service as any, 'generateHandoff').mockResolvedValue(undefined);
      const bridge = vi.spyOn(service as any, 'bridgeResultToCreator').mockResolvedValue(undefined);

      await service.onTopicComplete({
        lastAssistantContent: 'enough content to count as substantive output',
        operationId: 'op-1',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(bridge).toHaveBeenCalledTimes(1);
    });

    it('re-drives the original Verify run after a corrective integration settles', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);
      vi.spyOn(service as any, 'generateHandoff').mockResolvedValue(undefined);
      (service as any).taskTopicModel.findByTopicId.mockResolvedValue({
        integration: { state: 'integrated', verifyOperationId: 'op-original' },
        topicId: 'topic-corrective',
      });

      await service.onTopicComplete({
        operationId: 'op-corrective',
        reason: 'done',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-corrective',
      });

      expect(deferredVerifyDrive).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'op-original',
        undefined,
      );
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
    });
  });

  describe('reason=error', () => {
    it('does not require remote delivery identity for a failed run', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'builder failed before push',
        operationId: 'op-1',
        reason: 'error',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(captureRemoteIdentityOnComplete).not.toHaveBeenCalled();
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', {
        error: 'builder failed before push',
      });
    });

    it('non-automation task → status="paused" (unchanged behavior)', async () => {
      const task = baseTask({ automationMode: null });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', { error: 'boom' });
    });

    it('manual run of a schedule task fails → restored to scheduled, NOT paused', async () => {
      const task = baseTask({ automationMode: 'schedule', status: 'running' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      // Restored to the resting scheduled state so the next cron tick still
      // fires — never paused off the schedule.
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: 'boom' });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
      // Manual failure must NOT touch the consecutive-failure fuse.
      expect(updateContext).not.toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ scheduler: expect.anything() }),
      );
    });

    it('undefined runTrigger defaults to manual (backward compat)', async () => {
      const task = baseTask({ automationMode: 'schedule' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: 'boom' });
    });

    it('scheduled run fails below fuse → stays scheduled + increments failures', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        context: { scheduler: { consecutiveFailures: 1 } } as any,
      });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      // 1 prior + this one = 2, below the fuse of 3 → retryable, stays scheduled.
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: 'boom' });
      expect(updateStatus).not.toHaveBeenCalledWith('task-1', 'paused', expect.anything());
      expect(updateContext).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ scheduler: { consecutiveFailures: 2 } }),
      );
    });

    it('scheduled run fails AT fuse → pauses for human attention', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        context: { scheduler: { consecutiveFailures: 2 } } as any,
      });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      // 2 prior + this one = 3 = fuse → pause.
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'paused', { error: 'boom' });
      // Audit trail records the pause reason durably.
      expect(updateContext).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          lifecycle: expect.objectContaining({ lastPausedAt: expect.any(String) }),
          scheduler: { consecutiveFailures: 3 },
        }),
      );
    });

    it('every error appends to the durable lifecycle audit trail', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        context: { lifecycle: { errorCount: 4 } } as any,
      });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateContext).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          lifecycle: expect.objectContaining({
            errorCount: 5,
            lastError: expect.objectContaining({ message: 'boom', trigger: 'schedule' }),
          }),
        }),
      );
    });

    it('every error branch still emits an urgent error brief', async () => {
      const task = baseTask({ automationMode: 'schedule' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(createBrief).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'urgent', type: 'error' }),
      );
    });

    it('error brief keeps internal ids out of the user-facing copy', async () => {
      const task = baseTask({ automationMode: 'schedule' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'Workspace budget exceeded',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      const brief = lastCreatedBrief();
      // Title/summary are human-facing: no raw topic id, no "topic #N", no
      // "Execution failed:" log framing. The topic id lives on `topicId`.
      expect(brief.title).not.toContain('topic-1');
      expect(brief.title).not.toMatch(/topic #/i);
      expect(brief.summary).not.toMatch(/execution failed/i);
      expect(brief.summary).toBe('Workspace budget exceeded');
      expect(brief.topicId).toBe('topic-1');
    });

    it('a budget error leads with an upgrade remedy instead of a futile retry', async () => {
      const subscriptionUrl = 'https://orvilo.example.com/subscription';
      mockBrandingUrl.subscription = subscriptionUrl;

      const task = baseTask({ automationMode: 'schedule' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorCode: 'InsufficientBudgetForModel',
        errorMessage: 'Workspace budget exceeded',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      const brief = lastCreatedBrief();
      const keys = brief.actions.map((a: { key: string }) => a.key);
      // Retrying a budget failure just re-fails — offer the fix, not Retry.
      expect(keys).toContain('upgrade');
      expect(keys).not.toContain('retry');
      const upgrade = brief.actions.find((a: { key: string }) => a.key === 'upgrade');
      expect(upgrade).toMatchObject({
        key: 'upgrade',
        label: 'Upgrade plan',
        type: 'link',
        url: subscriptionUrl,
      });
      // Structured cause persisted for observability / future mapping.
      expect(brief.metadata).toEqual({ error: { code: 'InsufficientBudgetForModel' } });
      // Summary is the human, localized message mapped from the error code — not
      // the raw provider string.
      expect(brief.summary).toBe('Not enough credits — top up or upgrade to continue.');
    });

    it('a budget error with no subscription url keeps the default error actions', async () => {
      // Shipped config: this distribution has no subscription page, so the
      // billing branch cannot render a link — the card keeps the default
      // remedies rather than shipping an action whose url is undefined.
      expect(mockBrandingUrl.subscription).toBeUndefined();

      const task = baseTask({ automationMode: 'schedule' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorCode: 'InsufficientBudgetForModel',
        errorMessage: 'Workspace budget exceeded',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      const brief = lastCreatedBrief();
      const keys = brief.actions.map((a: { key: string }) => a.key);
      expect(keys).toContain('retry');
      expect(keys).not.toContain('upgrade');
      expect(brief.actions).toEqual(DEFAULT_BRIEF_ACTIONS.error);
      // Only the remedy falls back — the billing copy and the structured cause
      // are unaffected by the missing subscription page.
      expect(brief.metadata).toEqual({ error: { code: 'InsufficientBudgetForModel' } });
      expect(brief.summary).toBe('Not enough credits — top up or upgrade to continue.');
    });

    it('a non-billing error keeps the default retry action', async () => {
      const task = baseTask({ automationMode: 'schedule' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorCode: 'ProviderBizError',
        errorMessage: 'upstream 500',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      const brief = lastCreatedBrief();
      const keys = brief.actions.map((a: { key: string }) => a.key);
      expect(keys).toContain('retry');
      expect(keys).not.toContain('upgrade');
    });
  });

  describe('reason=done recovery audit ', () => {
    it('successful automation tick after an error stamps lastRecoveredAt + resets fuse', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        context: { scheduler: { consecutiveFailures: 2 } } as any,
        error: 'previous boom',
        status: 'running',
      });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateContext).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          lifecycle: expect.objectContaining({ lastRecoveredAt: expect.any(String) }),
          scheduler: { consecutiveFailures: 0 },
        }),
      );
      // Live error still cleared so the UI shows a clean current state.
      expect(updateStatus).toHaveBeenCalledWith('task-1', 'scheduled', { error: null });
    });

    it('successful automation tick with no prior error does NOT write a recovery marker', async () => {
      const task = baseTask({ automationMode: 'schedule', context: {} as any, error: null });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(updateContext).not.toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ lifecycle: expect.anything() }),
      );
    });
  });

  describe('scheduled-task result notifications', () => {
    it('successful scheduled tick → completed notification with task identity', async () => {
      const task = baseTask({ automationMode: 'schedule', name: 'Daily digest' });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(notifyCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'op-1',
          taskId: 'task-1',
          taskIdentifier: 'TASK-1',
          taskName: 'Daily digest',
          topicId: 'topic-1',
          userId: 'user-1',
        }),
      );
      expect(notifyFailed).not.toHaveBeenCalled();
    });

    it('manual run and heartbeat tick success → NO completed notification', async () => {
      findById.mockResolvedValue(baseTask({ automationMode: 'schedule' }));
      await service.onTopicComplete({
        operationId: 'op-1',
        reason: 'done',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      findById.mockResolvedValue(baseTask({ automationMode: 'heartbeat' }));
      await service.onTopicComplete({
        operationId: 'op-2',
        reason: 'done',
        runTrigger: 'heartbeat',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(notifyCompleted).not.toHaveBeenCalled();
    });

    it('scheduled tick failure below fuse → failed notification, not paused', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        context: { scheduler: { consecutiveFailures: 0 } } as any,
        name: 'Daily digest',
      });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorCode: 'InsufficientBudgetForModel',
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(notifyFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          consecutiveFailures: 1,
          errorCode: 'InsufficientBudgetForModel',
          paused: false,
          runTrigger: 'schedule',
          taskName: 'Daily digest',
          userId: 'user-1',
        }),
      );
      // The raw error text must never cross the slot boundary.
      expect(JSON.stringify(notifyFailed.mock.calls[0][0])).not.toContain('boom');
      expect(notifyCompleted).not.toHaveBeenCalled();
    });

    it('scheduled tick failure that blows the fuse → paused failed notification', async () => {
      const task = baseTask({
        automationMode: 'schedule',
        context: { scheduler: { consecutiveFailures: 2 } } as any,
      });
      findById.mockResolvedValue(task);

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'schedule',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(notifyFailed).toHaveBeenCalledWith(
        expect.objectContaining({ consecutiveFailures: 3, paused: true }),
      );
    });

    it('manual failure of an automation task → NO failed notification (ad-hoc debug run)', async () => {
      findById.mockResolvedValue(baseTask({ automationMode: 'schedule' }));

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'manual',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(notifyFailed).not.toHaveBeenCalled();
    });

    it('transient heartbeat tick failure → NO notification (high-frequency ticks)', async () => {
      findById.mockResolvedValue(baseTask({ automationMode: 'heartbeat' }));

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'heartbeat',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(notifyFailed).not.toHaveBeenCalled();
    });

    it('heartbeat failure that blows the fuse → paused failed notification', async () => {
      findById.mockResolvedValue(
        baseTask({
          automationMode: 'heartbeat',
          context: { scheduler: { consecutiveFailures: 2 } } as any,
        }),
      );

      await service.onTopicComplete({
        errorMessage: 'boom',
        operationId: 'op-1',
        reason: 'error',
        runTrigger: 'heartbeat',
        taskId: 'task-1',
        taskIdentifier: 'TASK-1',
        topicId: 'topic-1',
      });

      expect(notifyFailed).toHaveBeenCalledWith(
        expect.objectContaining({ consecutiveFailures: 3, paused: true, runTrigger: 'heartbeat' }),
      );
    });
  });
});
