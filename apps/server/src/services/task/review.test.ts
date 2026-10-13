// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentOperations } from '@/database/schemas';

import {
  completeIssueReviewOperation,
  startIssueReview,
  submitIssueReview,
  sweepIssueReviews,
} from './review';

const mocks = vi.hoisted(() => ({
  bind: vi.fn(),
  claim: vi.fn(),
  completeRepair: vi.fn(),
  exec: vi.fn(),
  findTask: vi.fn(),
  findDelivery: vi.fn(),
  findTopic: vi.fn(),
  findOperation: vi.fn(),
  findComment: vi.fn(),
  pending: vi.fn(),
  release: vi.fn(),
  verdict: vi.fn(),
  activeOperations: vi.fn(),
  probe: vi.fn(),
  settleRunning: vi.fn(),
  finalize: vi.fn(),
  runTask: vi.fn(),
  updateStatus: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: Object.assign(
    vi.fn(function () {
      return {
        bindIssueReviewOperation: mocks.bind,
        claimIssueReview: mocks.claim,
        completeIssueReviewRepair: mocks.completeRepair,
        findById: mocks.findTask,
        findCommentById: mocks.findComment,
        releaseIssueReview: mocks.release,
        recordIssueReviewVerdict: mocks.verdict,
      };
    }),
    { queryPendingIssueReviews: mocks.pending },
  ),
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return { getAgentConfigForExecution: vi.fn().mockResolvedValue({ model: 'saved' }) };
  }),
}));
vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn(function () {
    return { findById: mocks.findOperation, settleRunning: mocks.settleRunning };
  }),
}));
vi.mock('@/database/models/message', () => ({ MessageModel: vi.fn() }));
vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn(function () {
    return { findById: mocks.findTopic };
  }),
}));
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { executeToolCall: mocks.probe },
}));
vi.mock('../aiAgent/pipeline/heteroDispatch', () => ({
  finalizeHeteroDispatchError: mocks.finalize,
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(function () {
    return {
      findByOperationId: mocks.findDelivery,
    };
  }),
}));
vi.mock('@/database/models/team', () => ({
  TeamModel: vi.fn(function () {
    return { listWorkflowStates: vi.fn().mockResolvedValue([]) };
  }),
}));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: vi.fn(),
}));
vi.mock('@/server/services/aiAgent/pipeline/resolveExecutionBinding', () => ({
  agentCanMountBuiltinToolSurface: vi.fn().mockReturnValue(true),
}));
vi.mock('../aiAgent', () => ({
  AiAgentService: vi.fn(function () {
    return { execAgent: mocks.exec };
  }),
}));
vi.mock('./index', () => ({
  TaskService: vi.fn(function () {
    return { finalizeCompletedTask: mocks.updateStatus };
  }),
}));
vi.mock('../taskResultBridge', () => ({
  TaskResultBridgeService: vi.fn(function () {
    return { deliver: mocks.deliver };
  }),
}));
vi.mock('../taskRunner', () => ({
  TaskRunnerService: vi.fn(function () {
    return { runTask: mocks.runTask };
  }),
}));
const review = {
  cycleId: 'cycle',
  reviewerAgentId: 'reviewer',
  deliveryOperationId: 'delivery',
  consecutiveFailures: 0,
  state: 'pending' as const,
};
const task = {
  id: 'task',
  identifier: 'TASK-1',
  name: 'Title',
  description: 'Short metadata summary',
  instruction: 'Criterion in description',
  reviewerAgentId: 'reviewer',
  workflowCategory: 'in_review',
  createdByUserId: 'user',
  workspaceId: 'ws',
  config: { issueReview: review },
  updatedAt: new Date(),
} as unknown as TaskItem;
const db = {
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: () => (table === agentOperations ? mocks.activeOperations() : Promise.resolve([])),
      }),
    }),
  }),
} as never;
const params = {
  taskId: 'task',
  cycleId: 'cycle',
  operationId: 'review-op',
  actorAgentId: 'reviewer',
  verdict: 'pass' as const,
};

describe('ordinary Issue review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTask.mockResolvedValue(task);
    mocks.findDelivery.mockResolvedValue({
      handoff: { content: 'Delivered answer' },
      environmentSnapshot: { workingDirectory: '/work' },
    });
    mocks.findTopic.mockResolvedValue(null);
    mocks.claim.mockResolvedValue(review);
    mocks.bind.mockResolvedValue(true);
    mocks.findOperation.mockResolvedValue(undefined);
    mocks.settleRunning.mockResolvedValue(true);
    mocks.activeOperations.mockResolvedValue([]);
    mocks.probe.mockResolvedValue({ success: false });
    mocks.pending.mockResolvedValue([]);
    mocks.release.mockResolvedValue(true);
    mocks.exec.mockImplementation(async (input) => {
      await input.beforeOperationStart({ operationId: 'review-op', topicId: 'fresh-topic' });
      return { success: true, status: 'running', operationId: 'review-op' };
    });
    mocks.runTask.mockResolvedValue({ success: true });
  });
  it('asks a fresh saved reviewer to judge description and delivered reply at the delivery cwd', async () => {
    await startIssueReview(db, 'user', 'task', {}, 'ws');
    const request = mocks.exec.mock.calls[0][0];
    expect(request.prompt).toContain('Criterion in description');
    expect(request.prompt).toContain('Delivered answer');
    expect(request.prompt).toContain('/work');
    expect(request.appContext.topicId).toBeUndefined();
    expect(request.systemRole).toBeUndefined();
    expect(request.appContext.issueReviewCycleId).toBe('cycle');
    expect(mocks.bind).toHaveBeenCalledWith('task', {
      cycleId: 'cycle',
      actorAgentId: 'reviewer',
      operationId: 'review-op',
    });
  });
  it('includes the real saved-Agent delivery cwd when no workspace was provisioned', async () => {
    mocks.findDelivery.mockResolvedValue({
      topicId: 'delivered-topic',
      handoff: { content: 'Delivered answer' },
    });
    mocks.findTopic.mockResolvedValue({ metadata: { workingDirectory: '/saved-agent-project' } });
    await startIssueReview(db, 'user', 'task');
    expect(mocks.exec.mock.calls[0][0].prompt).toContain('Working directory: /saved-agent-project');
  });
  it('keeps the shared queue operation bound while a device is offline', async () => {
    mocks.exec.mockImplementation(async (input) => {
      await input.beforeOperationStart({ operationId: 'review-op', topicId: 'topic' });
      return { success: true, status: 'idle', autoStarted: false, operationId: 'review-op' };
    });
    await startIssueReview(db, 'user', 'task');
    expect(mocks.release).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({ operationId: 'review-op', keepOperation: true }),
    );
  });
  it('records pass once and does not start a repair', async () => {
    mocks.verdict.mockResolvedValue({
      task: { ...task, workflowCategory: 'done' },
      repairPending: false,
      stopped: false,
    });
    mocks.findTask.mockResolvedValue({ ...task, workflowCategory: 'done' });
    expect((await submitIssueReview(db, 'user', params)).task.workflowCategory).toBe('done');
    expect(mocks.runTask).not.toHaveBeenCalled();
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task', workflowCategory: 'done' }),
    );
    expect(mocks.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'delivery', reason: 'done' }),
    );
  });
  it('starts the ordinary assignee from durable failing feedback', async () => {
    const failed = {
      ...task,
      workflowCategory: 'in_progress',
      config: { issueReview: { ...review, repairPending: true, lastFailureCommentId: 'comment' } },
    };
    mocks.findTask.mockResolvedValue(failed);
    mocks.findComment.mockResolvedValue({ content: 'Missing criterion' });
    mocks.verdict.mockResolvedValue({ task: failed, repairPending: true, stopped: false });
    await submitIssueReview(db, 'user', {
      ...params,
      verdict: 'fail',
      comment: 'Missing criterion',
    });
    expect(mocks.runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        extraPrompt: 'Missing criterion',
        idempotencyKey: 'issue-review-repair:cycle',
        issueReviewRepairCycleId: 'cycle',
      }),
    );
    expect(mocks.completeRepair).toHaveBeenCalledTimes(1);
  });
  it('keeps repair pending while the reviewer is inside verdict submission and starts after its terminal event', async () => {
    const failed = {
      ...task,
      workflowCategory: 'in_progress',
      config: {
        issueReview: {
          ...review,
          reviewerOperationId: 'review-op',
          repairPending: true,
          lastFailureCommentId: 'comment',
        },
      },
    };
    mocks.findTask.mockResolvedValue(failed);
    mocks.findComment.mockResolvedValue({ content: 'Missing criterion' });
    mocks.verdict.mockResolvedValue({ task: failed, repairPending: true, stopped: false });
    mocks.activeOperations.mockResolvedValue([{ id: 'review-op' }]);
    await submitIssueReview(db, 'user', {
      ...params,
      verdict: 'fail',
      comment: 'Missing criterion',
    });
    expect(mocks.runTask).not.toHaveBeenCalled();
    expect(mocks.completeRepair).not.toHaveBeenCalled();
    mocks.findOperation.mockResolvedValue({
      taskId: 'task',
      status: 'done',
      appContext: { issueReviewCycleId: 'cycle' },
    });
    mocks.activeOperations.mockResolvedValue([]);
    await completeIssueReviewOperation(db, 'user', 'review-op', 'done');
    expect(mocks.runTask).toHaveBeenCalledTimes(1);
  });
  it('stops after the atomic third-failure verdict and rejects stale verdicts', async () => {
    mocks.verdict.mockResolvedValue({ task, repairPending: false, stopped: true });
    expect(
      (
        await submitIssueReview(db, 'user', {
          ...params,
          verdict: 'fail',
          comment: 'Still missing',
        })
      ).stopped,
    ).toBe(true);
    expect(mocks.runTask).not.toHaveBeenCalled();
    mocks.verdict.mockResolvedValue(null);
    await expect(submitIssueReview(db, 'user', params)).rejects.toThrow('changed');
  });
  it('does not accept a missing verdict; releases the same cycle for the next sweep', async () => {
    mocks.findOperation.mockResolvedValue({
      taskId: 'task',
      appContext: { issueReviewCycleId: 'cycle' },
    });
    await completeIssueReviewOperation(db, 'user', 'review-op', 'done');
    expect(mocks.release).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({
        cycleId: 'cycle',
        operationId: 'review-op',
        reason: expect.stringContaining('without submitting'),
      }),
    );
    mocks.pending.mockResolvedValue([task]);
    await sweepIssueReviews(db);
    expect(mocks.exec).toHaveBeenCalledTimes(1);
  });
  it('does not retry an operation whose ACK or device queue still owns it', async () => {
    mocks.pending.mockResolvedValue([
      {
        ...task,
        config: { issueReview: { ...review, reviewerOperationId: 'review-op', state: 'running' } },
      },
    ]);
    mocks.findOperation.mockResolvedValue({ status: 'idle' });
    await sweepIssueReviews(db);
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('retries a crashed reviewer only after its admitted device authoritatively reports it absent', async () => {
    mocks.pending.mockResolvedValue([
      {
        ...task,
        config: { issueReview: { ...review, reviewerOperationId: 'review-op', state: 'running' } },
      },
    ]);
    mocks.findOperation.mockResolvedValue({
      id: 'review-op',
      status: 'running',
      updatedAt: new Date(0),
      metadata: {
        remoteAdmission: {
          idempotencyKey: 'review-op',
          state: 'running',
          deviceId: 'saved-device',
        },
      },
    });
    mocks.probe.mockResolvedValueOnce({ success: false });
    await sweepIssueReviews(db);
    expect(mocks.exec).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({
        keepOperation: true,
        reason: expect.stringContaining('stopped responding'),
      }),
    );
    mocks.probe.mockResolvedValueOnce({ success: true, state: { active: false } });
    await sweepIssueReviews(db);
    expect(mocks.settleRunning).toHaveBeenCalledWith('review-op', 'error');
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.exec).toHaveBeenCalledTimes(1);
  });
  it('recovers a submitted failure whose reviewer crashed before its terminal event', async () => {
    const failed = {
      ...task,
      workflowCategory: 'in_progress',
      config: {
        issueReview: {
          ...review,
          state: 'submitted',
          reviewerOperationId: 'review-op',
          repairPending: true,
          lastFailureCommentId: 'comment',
        },
      },
    };
    mocks.pending.mockResolvedValue([failed]);
    mocks.findTask.mockResolvedValue(failed);
    mocks.findComment.mockResolvedValue({ content: 'Missing criterion' });
    mocks.findOperation.mockResolvedValue({
      id: 'review-op',
      status: 'running',
      updatedAt: new Date(0),
      metadata: {
        remoteAdmission: {
          idempotencyKey: 'review-op',
          state: 'running',
          deviceId: 'saved-device',
        },
      },
    });
    mocks.activeOperations.mockResolvedValue([{ id: 'review-op' }]);
    mocks.probe.mockResolvedValue({ success: true, state: { active: false } });
    mocks.settleRunning.mockImplementationOnce(async () => {
      mocks.activeOperations.mockResolvedValue([]);
      return true;
    });
    await sweepIssueReviews(db);
    expect(mocks.probe).toHaveBeenCalledTimes(1);
    expect(mocks.settleRunning).toHaveBeenCalledWith('review-op', 'error');
    expect(mocks.runTask).toHaveBeenCalledTimes(1);
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('preserves a healthy long reviewer and an uncertain dispatch ACK', async () => {
    mocks.pending.mockResolvedValue([
      {
        ...task,
        config: { issueReview: { ...review, reviewerOperationId: 'review-op', state: 'running' } },
      },
    ]);
    const operation = {
      id: 'review-op',
      status: 'running',
      updatedAt: new Date(0),
      metadata: {
        remoteAdmission: {
          idempotencyKey: 'review-op',
          state: 'running',
          deviceId: 'saved-device',
        },
      },
    };
    mocks.findOperation.mockResolvedValue(operation);
    mocks.probe.mockResolvedValueOnce({ success: true, state: { active: true } });
    await sweepIssueReviews(db);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.settleRunning).not.toHaveBeenCalled();
    expect(mocks.exec).not.toHaveBeenCalled();
    operation.metadata.remoteAdmission.state = 'unknown';
    mocks.probe.mockResolvedValueOnce({ success: true, state: { active: false } });
    await sweepIssueReviews(db);
    expect(mocks.settleRunning).not.toHaveBeenCalled();
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('requires a nonempty failure comment before any mutation', async () => {
    await expect(
      submitIssueReview(db, 'user', { ...params, verdict: 'fail', comment: ' ' }),
    ).rejects.toThrow('requires a comment');
    expect(mocks.verdict).not.toHaveBeenCalled();
  });
});
