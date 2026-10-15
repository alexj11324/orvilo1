// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertIssueExecutionInput } from './issueExecutionInput';
import { resolveIssueInstructionTarget } from './issueInstruction';
import { assertCanUseOperationAgent } from './nativeInterventionInput';

vi.mock('./issueExecutionInput', () => ({ assertIssueExecutionInput: vi.fn() }));
vi.mock('./nativeInterventionInput', () => ({ assertCanUseOperationAgent: vi.fn() }));
const mocks = vi.hoisted(() => ({ findTopic: vi.fn() }));
const ctx = {
  serverDB: {} as never,
  userId: 'current-assignee',
  workspaceId: 'workspace',
  taskTopicModel: { findByTopicId: mocks.findTopic },
};
const task = {
  id: 'issue',
  assigneeAgentId: 'saved-agent',
  assigneeUserId: 'current-assignee',
  currentTopicId: 'original-topic',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findTopic.mockResolvedValue({ taskId: 'issue', operationId: 'original-operation' });
  vi.mocked(assertCanUseOperationAgent).mockResolvedValue({
    agentId: 'saved-agent',
    userId: 'original-caller',
    workspaceId: 'workspace',
    topicId: 'original-topic',
    status: 'done',
    groupId: null,
  });
});

describe('Issue Activity instruction target', () => {
  it('continues the sealed original caller and topic after the human assignee changes', async () => {
    await expect(
      resolveIssueInstructionTarget(ctx, task, {
        agentId: 'saved-agent',
        topicId: 'original-topic',
      }),
    ).resolves.toEqual({
      agentId: 'saved-agent',
      executionUserId: 'original-caller',
      topicId: 'original-topic',
    });
    expect(assertCanUseOperationAgent).toHaveBeenCalledWith({
      db: ctx.serverDB,
      userId: ctx.userId,
      workspaceId: 'workspace',
      operationId: 'original-operation',
      topicId: 'original-topic',
    });
  });

  it('does not authorize an editor or revoked Agent user to append execution input', async () => {
    vi.mocked(assertCanUseOperationAgent).mockRejectedValueOnce(new Error('assignee required'));
    await expect(resolveIssueInstructionTarget(ctx, task)).rejects.toThrow('assignee required');
  });

  it('rejects another mentioned Agent, historical topic, and a topic from another Issue', async () => {
    await expect(
      resolveIssueInstructionTarget(ctx, task, { agentId: 'other' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      resolveIssueInstructionTarget(ctx, task, { topicId: 'old-topic' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    mocks.findTopic.mockResolvedValueOnce({
      taskId: 'other-issue',
      operationId: 'original-operation',
    });
    await expect(resolveIssueInstructionTarget(ctx, task)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(assertCanUseOperationAgent).not.toHaveBeenCalled();
  });

  it('does not silently switch a continued Run to a newly assigned Agent', async () => {
    vi.mocked(assertCanUseOperationAgent).mockResolvedValueOnce({
      agentId: 'previous-agent',
      userId: 'original-caller',
      workspaceId: 'workspace',
      topicId: 'original-topic',
      status: 'done',
      groupId: null,
    });
    await expect(resolveIssueInstructionTarget(ctx, task)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('authorizes initial input without creating a substitute Agent or borrowing another user', async () => {
    await expect(
      resolveIssueInstructionTarget(ctx, { ...task, currentTopicId: null }),
    ).resolves.toEqual({ agentId: 'saved-agent', executionUserId: 'current-assignee' });
    expect(assertIssueExecutionInput).toHaveBeenCalledWith(ctx, { ...task, currentTopicId: null });
    expect(mocks.findTopic).not.toHaveBeenCalled();
  });
});
