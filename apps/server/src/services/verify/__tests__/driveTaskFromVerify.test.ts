// @vitest-environment node
import {
  ACCEPTANCE_REVIEW_ERRORED_ERROR,
  VERIFICATION_UNJUDGEABLE_ERROR,
} from '@orvilo/const/goal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scheduleGoalAdvance } from '@/server/services/goal/scheduler';

import { reviewGoalDelivery } from '../goalReview';
import { driveTaskFromVerify, finalizeVerifyRun } from '../settle';

vi.mock('../goalReview', () => ({ reviewGoalDelivery: vi.fn() }));

vi.mock('../repairService', () => ({
  maybeAutoRepair: vi.fn(),
}));
vi.mock('../reporter', () => ({
  VerifyReporterService: vi.fn(function () {
    return { generateReport: vi.fn() };
  }),
}));

const {
  dispatchIsCurrentContract,
  goalFindByTask,
  runFindByOperation,
  runClaimTaskDrive,
  runCompleteTaskDrive,
  runReleaseTaskDrive,
  runRenewTaskDrive,
  runSetMetadata,
  opFindById,
  taskFindById,
  taskReleaseRunReservation,
  taskRenewRunReservation,
  taskTopicFindByOperationId,
  taskUpdateStatus,
  taskUpdateStatusForExecutionContract,
  taskUpdateStatusIfReservation,
  briefModelConstruct,
  briefCreate,
  serviceUpdateStatus,
  statusRecompute,
  deliverMock,
  rearmHeartbeatAfterVerify,
  scheduleCapReached,
  integrateOnComplete,
  topicFindByTopicId,
} = vi.hoisted(() => ({
  dispatchIsCurrentContract: vi.fn(),
  goalFindByTask: vi.fn(),
  briefCreate: vi.fn(),
  briefModelConstruct: vi.fn(),
  deliverMock: vi.fn(),
  rearmHeartbeatAfterVerify: vi.fn(),
  scheduleCapReached: vi.fn(),
  integrateOnComplete: vi.fn(),
  opFindById: vi.fn(),
  runFindByOperation: vi.fn(),
  runClaimTaskDrive: vi.fn().mockResolvedValue('drive-owner'),
  runCompleteTaskDrive: vi.fn(),
  runReleaseTaskDrive: vi.fn(),
  runRenewTaskDrive: vi.fn(),
  runSetMetadata: vi.fn(),
  serviceUpdateStatus: vi.fn(),
  statusRecompute: vi.fn(),
  taskFindById: vi.fn(),
  taskReleaseRunReservation: vi.fn(),
  taskRenewRunReservation: vi.fn(),
  taskTopicFindByOperationId: vi.fn(),
  taskUpdateStatus: vi.fn(),
  taskUpdateStatusForExecutionContract: vi.fn(),
  taskUpdateStatusIfReservation: vi.fn(),
  topicFindByTopicId: vi.fn(),
}));

vi.mock('../statusService', () => ({
  VerifyStatusService: vi.fn(function () {
    return { recompute: statusRecompute };
  }),
}));

vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return {
      claimTaskDrive: runClaimTaskDrive,
      completeTaskDrive: runCompleteTaskDrive,
      findByOperation: runFindByOperation,
      releaseTaskDrive: runReleaseTaskDrive,
      renewTaskDrive: runRenewTaskDrive,
      setMetadata: runSetMetadata,
    };
  }),
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(function () {
    return {
      findByOperationId: taskTopicFindByOperationId,
      findByTopicId: topicFindByTopicId,
    };
  }),
}));
vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: vi.fn(function () {
    return { isCurrentContract: dispatchIsCurrentContract };
  }),
}));
vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn(function () {
    return { findById: opFindById };
  }),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return {
      findById: taskFindById,
      releaseRunReservation: taskReleaseRunReservation,
      renewRunReservation: taskRenewRunReservation,
      updateStatus: taskUpdateStatus,
      updateStatusIfReservation: taskUpdateStatusIfReservation,
      updateStatusForExecutionContract: taskUpdateStatusForExecutionContract,
    };
  }),
}));
vi.mock('@/database/models/brief', () => ({
  BriefModel: briefModelConstruct,
}));
// Resolved via dynamic import inside driveTaskFromVerify (cycle break).
vi.mock('@/server/services/task', () => ({
  TaskService: vi.fn(function () {
    return { updateStatus: serviceUpdateStatus };
  }),
}));
// The deferred creator callback, also resolved via dynamic import.
vi.mock('@/server/services/taskResultBridge', () => ({
  TaskResultBridgeService: vi.fn(function () {
    return { deliver: deliverMock };
  }),
}));
vi.mock('@/server/services/taskIntegration', () => ({
  TaskIntegrationService: vi.fn(function () {
    return { integrateOnComplete };
  }),
}));
vi.mock('@/server/services/taskLifecycle', () => ({
  TaskLifecycleService: vi.fn(function () {
    return { rearmHeartbeatAfterVerify, scheduleCapReached };
  }),
}));

const db = {} as any;

describe('driveTaskFromVerify', () => {
  it('automatically sends a Goal delivery back when Acceptance review rejects a Verify pass', async () => {
    runFindByOperation.mockResolvedValue({
      id: 'run-1',
      acceptanceId: 'acceptance-1',
      status: 'passed',
    });
    goalFindByTask.mockResolvedValue({ id: 'goal-1' });
    vi.mocked(reviewGoalDelivery).mockResolvedValueOnce({
      status: 'rejected',
      feedback: 'Fix the table',
      predictionIds: ['p1'],
    });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(taskUpdateStatusForExecutionContract).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.objectContaining({ executionGeneration: 1, requirementRevision: 1 }),
      expect.objectContaining({ error: 'Delivery did not pass verification.' }),
    );
    expect(deliverMock).toHaveBeenCalledWith(expect.objectContaining({ reason: 'error' }));
    expect(scheduleGoalAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: 'goal-1', trigger: 'settle' }),
    );
  });

  /**
   * Regression: an undecidable criterion paused the Task with the "did not pass"
   * contract string, which the coordinator routes to another attempt. The
   * builder re-delivered the same artifacts against the same criterion twice and
   * the attempt budget ran out. This string has no recovery branch, so the Goal
   * stops on a person instead.
   */
  it('parks an undecidable Goal delivery on a person instead of another attempt', async () => {
    runFindByOperation.mockResolvedValue({
      id: 'run-1',
      acceptanceId: 'acceptance-1',
      status: 'passed',
    });
    goalFindByTask.mockResolvedValue({ id: 'goal-1' });
    vi.mocked(reviewGoalDelivery).mockResolvedValueOnce({
      status: 'unjudgeable',
      feedback: 'The check asks the reviewer to rerun the scripts.',
      predictionIds: ['p1'],
    });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(taskUpdateStatusForExecutionContract).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.any(Object),
      expect.objectContaining({ error: VERIFICATION_UNJUDGEABLE_ERROR }),
    );
    expect(taskUpdateStatusForExecutionContract).not.toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.any(Object),
      expect.objectContaining({ error: 'Delivery did not pass verification.' }),
    );
  });

  /**
   * Regression: a review that could not run paused the Task with the errored
   * contract string, which the coordinator recovers by starting another builder
   * attempt. A review that failed the same way every time — its model could not
   * download a screenshot — re-delivered the same work until the attempt budget
   * ran out, without the delivery ever being judged.
   */
  it('parks a review that keeps failing on a person instead of another attempt', async () => {
    runFindByOperation.mockResolvedValue({
      id: 'run-1',
      acceptanceId: 'acceptance-1',
      status: 'passed',
    });
    vi.mocked(reviewGoalDelivery).mockResolvedValue({
      status: 'errored',
      feedback: 'Error while downloading file. Upstream status code: 407.',
      predictionIds: [],
    });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    // The review retries its own errored checks; the settle path must not rerun
    // the whole review, which would re-ask checks that already rejected.
    expect(reviewGoalDelivery).toHaveBeenCalledTimes(1);
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(taskUpdateStatusForExecutionContract).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.any(Object),
      expect.objectContaining({ error: ACCEPTANCE_REVIEW_ERRORED_ERROR }),
    );
    // The creator still hears the delivery was not evaluated, not that it failed.
    expect(deliverMock.mock.calls[0][0].errorMessage.toLowerCase()).toContain('internal error');
  });

  it('does not launch a duplicate review when task drive is already claimed', async () => {
    runFindByOperation.mockResolvedValue({
      id: 'run-1',
      acceptanceId: 'acceptance-1',
      status: 'passed',
    });
    runClaimTaskDrive.mockResolvedValue(false);
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(reviewGoalDelivery).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.mocked(reviewGoalDelivery).mockReset();
    vi.mocked(scheduleGoalAdvance).mockClear();
    goalFindByTask.mockReset();
    [
      runClaimTaskDrive,
      dispatchIsCurrentContract,
      runCompleteTaskDrive,
      runReleaseTaskDrive,
      runRenewTaskDrive,
      runFindByOperation,
      runSetMetadata,
      opFindById,
      taskFindById,
      taskReleaseRunReservation,
      taskRenewRunReservation,
      taskTopicFindByOperationId,
      taskUpdateStatus,
      taskUpdateStatusForExecutionContract,
      taskUpdateStatusIfReservation,
      briefModelConstruct,
      briefCreate,
      serviceUpdateStatus,
      statusRecompute,
      deliverMock,
      rearmHeartbeatAfterVerify,
      scheduleCapReached,
      integrateOnComplete,
      topicFindByTopicId,
    ].forEach((m) => m.mockReset());
    // The drive is claimed before any side effect; unclaimed means "someone
    // else is driving this run", which every test here is not.
    runClaimTaskDrive.mockResolvedValue('drive-owner');
    dispatchIsCurrentContract.mockResolvedValue(true);
    runCompleteTaskDrive.mockResolvedValue(true);
    runReleaseTaskDrive.mockResolvedValue(true);
    runRenewTaskDrive.mockResolvedValue(true);
    taskRenewRunReservation.mockResolvedValue(true);
    taskUpdateStatusIfReservation.mockResolvedValue({ id: 'task-1' });
    taskUpdateStatusForExecutionContract.mockResolvedValue({ id: 'task-1', status: 'paused' });
    scheduleCapReached.mockResolvedValue(false);
    serviceUpdateStatus.mockImplementation(async (...args: unknown[]) => {
      const options = args[3] as { onStatusCommitted?: () => void } | undefined;
      options?.onStatusCommitted?.();
      return { paused: [], task: {}, unlocked: [] };
    });
    integrateOnComplete.mockResolvedValue('settled');
    briefModelConstruct.mockImplementation(function () {
      return { create: briefCreate };
    });
    opFindById.mockResolvedValue({ id: 'op-1', taskId: 'task-1', topicId: 'topic-done' });
    topicFindByTopicId.mockImplementation(async (topicId: string) => ({
      dispatchFence: 2,
      dispatchId: 'dispatch-1',
      executionGeneration: 1,
      operationId: topicId === 'topic-repair' ? 'repair-op' : 'op-1',
      policyRevision: 1,
      requirementRevision: 1,
      taskId: 'task-1',
      topicId,
    }));
    taskFindById.mockResolvedValue({
      assigneeAgentId: 'a1',
      id: 'task-1',
      identifier: 'T-1',
      runReservationId: 'completion:op-1:lease-1',
      status: 'running',
    });
    taskTopicFindByOperationId.mockResolvedValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('passed → completes the task (with cascade), delivers the creator callback, marks done', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(serviceUpdateStatus).toHaveBeenCalledWith(
      {
        expectedContract: {
          assigneeAgentId: 'a1',
          executionGeneration: 1,
          policyRevision: 1,
          requirementRevision: 1,
          status: 'running',
        },
        id: 'task-1',
        status: 'completed',
      },
      undefined,
      {
        currentStatus: 'running',
        reservationId: 'completion:op-1:lease-1',
      },
      expect.objectContaining({ onStatusCommitted: expect.any(Function) }),
    );
    // Deferred creator callback fires here (not in onTopicComplete), reason 'done'.
    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(deliverMock.mock.calls[0][0]).toMatchObject({
      reason: 'done',
      taskId: 'task-1',
      taskIdentifier: 'T-1',
      topicId: 'topic-done',
    });
    expect(runClaimTaskDrive).toHaveBeenCalledWith('run-1');
    expect(rearmHeartbeatAfterVerify).not.toHaveBeenCalled();
  });

  it('renews the task completion reservation while Verify drives the task', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(taskRenewRunReservation).toHaveBeenCalledWith(
      'task-1',
      'completion:op-1:lease-1',
    );
  });

  it('stops treating the completion reservation as external ownership loss after commit', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    serviceUpdateStatus.mockImplementationOnce(async (...args: unknown[]) => {
      const options = args[3] as { onStatusCommitted?: () => void } | undefined;
      options?.onStatusCommitted?.();
      // A renewal after the atomic status write would now fail because that
      // write consumed the reservation. The remaining task-drive work must
      // continue instead of retiring as a superseded Verify generation.
      taskRenewRunReservation.mockResolvedValue(false);
      return { paused: [], task: {}, unlocked: [] };
    });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'done', taskId: 'task-1' }),
    );
    expect(runCompleteTaskDrive).toHaveBeenCalledWith('run-1', 'drive-owner');
  });

  it('passed → keeps a recurring task scheduled', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById.mockResolvedValue({
      assigneeAgentId: 'a1',
      automationMode: 'heartbeat',
      id: 'task-1',
      identifier: 'T-1',
      runReservationId: 'completion:op-1:lease-1',
      status: 'scheduled',
    });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(taskUpdateStatus).not.toHaveBeenCalled();
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'done', taskId: 'task-1' }),
    );
    expect(runClaimTaskDrive).toHaveBeenCalledWith('run-1');
    expect(rearmHeartbeatAfterVerify).toHaveBeenCalledWith('task-1');
  });

  it('passed → completes a schedule task after its final allowed verified run', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById.mockResolvedValue({
      assigneeAgentId: 'a1',
      automationMode: 'schedule',
      id: 'task-1',
      identifier: 'T-1',
      runReservationId: 'completion:op-1:lease-1',
      status: 'scheduled',
    });
    scheduleCapReached.mockResolvedValue(true);

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(scheduleCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', automationMode: 'schedule' }),
    );
    expect(serviceUpdateStatus).toHaveBeenCalledWith(
      { id: 'task-1', status: 'completed' },
      undefined,
      {
        currentStatus: 'scheduled',
        reservationId: 'completion:op-1:lease-1',
      },
      expect.objectContaining({ onStatusCommitted: expect.any(Function) }),
    );
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'done', taskId: 'task-1' }),
    );
    expect(runCompleteTaskDrive).toHaveBeenCalledWith('run-1', 'drive-owner');
  });

  it('retires a capped Verify drive without side effects after the user supersedes its lease', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById.mockResolvedValue({
      assigneeAgentId: 'a1',
      automationMode: 'schedule',
      id: 'task-1',
      identifier: 'T-1',
      runReservationId: 'completion:op-1:lease-1',
      status: 'scheduled',
    });
    scheduleCapReached.mockResolvedValue(true);
    taskRenewRunReservation.mockResolvedValue(false);
    serviceUpdateStatus.mockResolvedValueOnce(null);

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(deliverMock).not.toHaveBeenCalled();
    expect(taskReleaseRunReservation).not.toHaveBeenCalled();
    expect(rearmHeartbeatAfterVerify).not.toHaveBeenCalled();
    expect(runCompleteTaskDrive).toHaveBeenCalledWith('run-1', 'drive-owner');
  });

  it('uses the current schedule cap after configuration changes while Verify is pending', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById
      .mockResolvedValueOnce({
        automationMode: 'schedule',
        config: { schedule: { maxExecutions: 1 } },
        id: 'task-1',
        identifier: 'T-1',
        runReservationId: 'completion:op-1:lease-1',
        status: 'scheduled',
      })
      .mockResolvedValue({
        automationMode: 'schedule',
        config: { schedule: { maxExecutions: 10 } },
        id: 'task-1',
        identifier: 'T-1',
        runReservationId: 'completion:op-1:lease-1',
        status: 'scheduled',
      });
    scheduleCapReached.mockResolvedValue(false);

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(scheduleCapReached).toHaveBeenCalledWith(
      expect.objectContaining({ config: { schedule: { maxExecutions: 10 } } }),
    );
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'done', taskId: 'task-1' }),
    );
  });

  it('keeps the task-drive lease reclaimable when heartbeat re-arm fails', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById.mockResolvedValue({
      automationMode: 'heartbeat',
      id: 'task-1',
      identifier: 'T-1',
      status: 'scheduled',
    });
    rearmHeartbeatAfterVerify.mockRejectedValueOnce(new Error('scheduler unavailable'));

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(runCompleteTaskDrive).not.toHaveBeenCalled();
  });

  it('defers task drive until a corrective integration run settles', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    integrateOnComplete.mockResolvedValue('hold');

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(integrateOnComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        completionReservationId: 'completion:op-1:lease-1',
        verifyOperationId: 'op-1',
      }),
    );
    expect(runReleaseTaskDrive).toHaveBeenCalledWith('run-1', 'drive-owner');
    expect(runCompleteTaskDrive).not.toHaveBeenCalled();
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('settles the owning task when the passing verify run belongs to a repair child', async () => {
    runFindByOperation.mockResolvedValue({ id: 'repair-run', metadata: null, status: 'passed' });
    opFindById.mockImplementation(async (id: string) =>
      id === 'repair-op'
        ? { id, parentOperationId: 'root-op', taskId: null, topicId: 'topic-repair' }
        : { id, parentOperationId: null, taskId: 'task-1', topicId: 'topic-original' },
    );
    topicFindByTopicId.mockImplementation(async (topicId: string) => ({
      dispatchFence: 2,
      dispatchId: 'dispatch-1',
      executionGeneration: 1,
      operationId: topicId === 'topic-original' ? 'root-op' : 'repair-op',
      policyRevision: 1,
      requirementRevision: 1,
      taskId: 'task-1',
      topicId,
    }));

    await driveTaskFromVerify(db, 'u1', 'repair-op');

    expect(serviceUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', status: 'completed' }),
      undefined,
      expect.objectContaining({ reservationId: 'completion:op-1:lease-1' }),
      expect.objectContaining({ onStatusCommitted: expect.any(Function) }),
    );
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'repair-op',
        taskId: 'task-1',
        topicId: 'topic-repair',
      }),
    );
  });

  it('collapses every ancestor round out of repairing when a multi-repair child settles', async () => {
    runFindByOperation.mockResolvedValue({ id: 'repair-run', metadata: null, status: 'passed' });
    opFindById.mockImplementation(async (id: string) =>
      id === 'repair-op-2'
        ? { parentOperationId: 'repair-op-1', taskId: null, topicId: 'topic-repair' }
        : id === 'repair-op-1'
          ? { parentOperationId: 'root-op', taskId: null, topicId: 'topic-repair' }
          : { parentOperationId: null, taskId: 'task-1', topicId: 'topic-original' },
    );

    await finalizeVerifyRun(db, 'u1', 'repair-op-2', {});

    expect(statusRecompute.mock.calls).toEqual([['repair-op-1'], ['root-op']]);
  });

  it('failed → keeps a recurring task scheduled instead of pausing (disarming) it', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'failed' });
    taskFindById.mockResolvedValue({
      assigneeAgentId: 'a1',
      automationMode: 'schedule',
      id: 'task-1',
      identifier: 'T-1',
      status: 'scheduled',
    });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    // Pausing would permanently disarm the cron — the schedule query never
    // picks `paused` tasks up again. The verdict stays on the run.
    expect(taskUpdateStatus).not.toHaveBeenCalled();
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    // The tick's rejection still reaches the creator callback.
    expect(deliverMock.mock.calls[0][0]).toMatchObject({ reason: 'error', taskId: 'task-1' });
  });

  it('errored → keeps a recurring task scheduled', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'errored' });
    taskFindById.mockResolvedValue({
      assigneeAgentId: 'a1',
      automationMode: 'heartbeat',
      id: 'task-1',
      identifier: 'T-1',
      status: 'scheduled',
    });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(taskUpdateStatus).not.toHaveBeenCalled();
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
  });

  it('failed → pauses with the reason on the task row without creating an inbox brief', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'failed' });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(briefModelConstruct).not.toHaveBeenCalled();
    expect(taskUpdateStatusForExecutionContract).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.any(Object),
      expect.objectContaining({ error: 'Delivery did not pass verification.' }),
    );
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    // Creator is told it failed verification (reason 'error'), not a passed result.
    expect(deliverMock.mock.calls[0][0]).toMatchObject({ reason: 'error', taskId: 'task-1' });
  });

  it('errored → pauses without an inbox brief; never claims the delivery "did not pass"', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'errored' });
    await driveTaskFromVerify(db, 'u1', 'op-1');

    // Paused for a human, but NOT completed — the delivery was never evaluated.
    expect(taskUpdateStatusForExecutionContract).toHaveBeenCalledWith(
      'task-1',
      'paused',
      expect.any(Object),
      expect.objectContaining({ error: expect.stringContaining('could not run') }),
    );
    expect(serviceUpdateStatus).not.toHaveBeenCalled();

    expect(briefModelConstruct).not.toHaveBeenCalled();

    // The creator callback is an error, but the message must NOT accuse the
    // delivery of failing verification.
    const deliverArg = deliverMock.mock.calls[0][0];
    expect(deliverArg.reason).toBe('error');
    expect(deliverArg.errorMessage).not.toBe('Delivery did not pass verification.');
    expect(deliverArg.errorMessage.toLowerCase()).toContain('internal error');
  });

  it('skips when the run has not terminally settled (verifying/repairing)', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'verifying' });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(taskUpdateStatus).not.toHaveBeenCalled();
  });

  it('skips a non-task-bound run', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    opFindById.mockResolvedValue({ taskId: null });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
  });

  it('is idempotent — does not re-drive once taskDrivenAt is set', async () => {
    runFindByOperation.mockResolvedValue({
      id: 'run-1',
      metadata: { taskDrivenAt: '2026-01-01' },
      status: 'passed',
    });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
  });

  it('skips when the task is already terminal', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById.mockResolvedValue({ id: 'task-1', status: 'completed' });
    await driveTaskFromVerify(db, 'u1', 'op-1');
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
  });

  it('does not let an older verify generation mutate the current task', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById.mockResolvedValue({
      currentTopicId: 'topic-current',
      id: 'task-1',
      status: 'running',
    });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(runClaimTaskDrive).not.toHaveBeenCalled();
    expect(integrateOnComplete).not.toHaveBeenCalled();
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
    expect(taskUpdateStatus).not.toHaveBeenCalled();
  });

  it('defers a settled Verify verdict until the task callback claims the running topic', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    topicFindByTopicId.mockResolvedValue({ operationId: 'op-1', status: 'running' });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(runClaimTaskDrive).not.toHaveBeenCalled();
    expect(integrateOnComplete).not.toHaveBeenCalled();
    expect(serviceUpdateStatus).not.toHaveBeenCalled();
  });

  it('re-drives the original verify after its corrective integration generation settles', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });
    taskFindById.mockResolvedValue({
      currentTopicId: 'topic-current',
      id: 'task-1',
      runReservationId: 'completion:op-corrective:lease-2',
      status: 'running',
    });
    topicFindByTopicId.mockImplementation(async (topicId: string) =>
      topicId === 'topic-current'
        ? {
            integration: {
              state: 'integrated',
              verifyOperationId: 'op-1',
            },
            operationId: 'op-corrective',
          }
        : {
            dispatchFence: 2,
            dispatchId: 'dispatch-1',
            executionGeneration: 1,
            operationId: 'op-1',
            policyRevision: 1,
            requirementRevision: 1,
            taskId: 'task-1',
            topicId,
          },
    );

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(runClaimTaskDrive).toHaveBeenCalledWith('run-1');
    expect(serviceUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', status: 'completed' }),
      undefined,
      expect.objectContaining({ reservationId: 'completion:op-corrective:lease-2' }),
      expect.objectContaining({ onStatusCommitted: expect.any(Function) }),
    );
  });

  it('completes the task on a passing verify', async () => {
    runFindByOperation.mockResolvedValue({ id: 'run-1', metadata: null, status: 'passed' });

    await driveTaskFromVerify(db, 'u1', 'op-1');

    expect(serviceUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', status: 'completed' }),
      undefined,
      expect.objectContaining({ reservationId: 'completion:op-1:lease-1' }),
      expect.objectContaining({ onStatusCommitted: expect.any(Function) }),
    );
    expect(briefCreate).not.toHaveBeenCalled();
  });
});

vi.mock('@/server/services/goal/scheduler', () => ({ scheduleGoalAdvance: vi.fn() }));
vi.mock('@/database/models/goal', () => ({
  GoalModel: vi.fn(function () {
    return { findByGraphTask: goalFindByTask };
  }),
}));
