// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requestReviewerAssignment,
  resumeReviewerAssignment,
  WAITING_FOR_REVIEWER,
} from './reviewerAssignment';

const mocks = vi.hoisted(() => ({
  execAgent: vi.fn(),
  findById: vi.fn(),
  getOrchestratorSourceAgentId: vi.fn(),
  getAgentConfigForExecution: vi.fn(),
  canMount: vi.fn(),
  resolveIssueReviewer: vi.fn(),
  resumeIssueVerification: vi.fn(),
  updateWithLog: vi.fn(),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { findById: mocks.findById, updateWithLog: mocks.updateWithLog };
  }),
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return {
      getOrchestratorSourceAgentId: mocks.getOrchestratorSourceAgentId,
      getAgentConfigForExecution: mocks.getAgentConfigForExecution,
    };
  }),
}));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: vi.fn(),
}));
vi.mock('@/server/services/aiAgent/pipeline/resolveExecutionBinding', () => ({
  agentCanMountBuiltinToolSurface: mocks.canMount,
}));
vi.mock('../aiAgent', () => ({
  AiAgentService: vi.fn(function () {
    return { execAgent: mocks.execAgent };
  }),
}));
vi.mock('../verify/reviewerAgent', () => ({ resolveIssueReviewer: mocks.resolveIssueReviewer }));
vi.mock('../verify/lifecycle', () => ({ resumeIssueVerification: mocks.resumeIssueVerification }));

const task = {
  id: 'task-1',
  identifier: 'TASK-1',
  currentTopicId: 'delivered-topic',
  workflowCategory: 'in_progress',
  parkedReason: 'review_required',
  error: WAITING_FOR_REVIEWER,
  domainRevision: 5,
  reviewerAgentId: null,
} as TaskItem;
const db = {} as never;
describe('reviewer assignment after delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(task);
    mocks.getOrchestratorSourceAgentId.mockResolvedValue('orchestrator');
    mocks.getAgentConfigForExecution.mockResolvedValue({ model: 'saved-model' });
    mocks.canMount.mockReturnValue(true);
    mocks.execAgent.mockResolvedValue({ success: true });
    mocks.updateWithLog.mockResolvedValue(task);
  });
  it('asks the chosen Orchestrator through task tools without replacing the delivered topic', async () => {
    await requestReviewerAssignment(db, 'user-1', task, 'ws-1');
    expect(mocks.execAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'orchestrator',
        additionalPluginIds: ['orvilo-task'],
        appContext: { taskId: 'task-1' },
        skipTaskVerification: true,
        prompt: expect.stringContaining('canVerifyDeliveries=true'),
      }),
    );
    expect(mocks.updateWithLog).not.toHaveBeenCalled();
  });
  it('keeps an unusable Orchestrator waiting without starting a run', async () => {
    mocks.canMount.mockReturnValue(false);
    await requestReviewerAssignment(db, 'user-1', task, 'ws-1');
    expect(mocks.execAgent).not.toHaveBeenCalled();
    expect(mocks.updateWithLog).toHaveBeenCalledWith(
      'task-1',
      { error: expect.stringContaining('cannot mount the task tool') },
      {},
      { expectedDomainRevision: 5 },
    );
  });
  it('does not ask the Orchestrator when a reviewer was already assigned', async () => {
    mocks.findById.mockResolvedValue({ ...task, reviewerAgentId: 'reviewer' });
    await requestReviewerAssignment(db, 'user-1', task, 'ws-1');
    expect(mocks.execAgent).not.toHaveBeenCalled();
  });
  it('keeps an unavailable Orchestrator readable and fences its explanation', async () => {
    mocks.execAgent.mockRejectedValue(new Error('device offline'));
    await requestReviewerAssignment(db, 'user-1', task, 'ws-1');
    expect(mocks.updateWithLog).toHaveBeenCalledWith(
      'task-1',
      { error: expect.stringContaining('device offline') },
      {},
      { expectedDomainRevision: 5 },
    );
  });
  it('shows a queued Orchestrator device wait without resubmitting its run', async () => {
    mocks.execAgent.mockResolvedValue({ success: true, status: 'idle', autoStarted: false });
    await requestReviewerAssignment(db, 'user-1', task, 'ws-1');
    expect(mocks.execAgent).toHaveBeenCalledTimes(1);
    expect(mocks.updateWithLog).toHaveBeenCalledWith(
      'task-1',
      { error: expect.stringContaining('waiting for reconnect') },
      {},
      { expectedDomainRevision: 5 },
    );
  });
  it('enters review and starts the delivered operation checks after assignment', async () => {
    mocks.findById.mockResolvedValue({ ...task, reviewerAgentId: 'reviewer' });
    await resumeReviewerAssignment(db, 'user-1', 'task-1', 'ws-1');
    expect(mocks.updateWithLog).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ workflowCategory: 'in_review', error: null }),
      {},
      { expectedDomainRevision: 5 },
    );
    expect(mocks.resumeIssueVerification).toHaveBeenCalledWith(
      db,
      'user-1',
      { taskId: 'task-1' },
      'ws-1',
    );
  });
  it('an unsupported reviewer keeps delivery waiting without checks', async () => {
    mocks.findById.mockResolvedValue({ ...task, reviewerAgentId: 'reviewer' });
    mocks.resolveIssueReviewer.mockRejectedValueOnce(new Error('cannot mount submitVerifyResult'));
    await resumeReviewerAssignment(db, 'user-1', 'task-1', 'ws-1');
    expect(mocks.updateWithLog).toHaveBeenCalledWith(
      'task-1',
      { error: expect.stringContaining('cannot mount submitVerifyResult') },
      {},
      { expectedDomainRevision: 5 },
    );
    expect(mocks.resumeIssueVerification).not.toHaveBeenCalled();
  });
  it('does not start checks after a lost revision fence', async () => {
    mocks.findById.mockResolvedValue({ ...task, reviewerAgentId: 'reviewer' });
    mocks.updateWithLog.mockResolvedValue(null);
    await resumeReviewerAssignment(db, 'user-1', 'task-1', 'ws-1');
    expect(mocks.resumeIssueVerification).not.toHaveBeenCalled();
  });
});
