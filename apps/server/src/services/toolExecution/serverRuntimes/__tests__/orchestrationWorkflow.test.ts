import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  post: vi.fn(),
  release: vi.fn(),
  advance: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock('@/server/services/orchestrationWorkflow/conversationPlan', () => ({
  OrchestrationWorkflowConversationPlanService: class {
    prepare = mocks.prepare;
    post = mocks.post;
    release = mocks.release;
  },
}));
vi.mock('@/server/services/orchestrationWorkflow/advanceOrchestrationWorkflow', () => ({
  advanceOrchestrationWorkflow: mocks.advance,
}));
vi.mock('@/server/services/orchestrationWorkflow/scheduler', () => ({
  scheduleOrchestrationWorkflowAdvance: mocks.schedule,
}));
const { orchestrationWorkflowRuntime } = await import('../orchestrationWorkflow');
const runtime = (messageId: string | undefined = 'user-reply') =>
  orchestrationWorkflowRuntime.factory({
    agentId: 'orchestrator',
    topicId: 'conversation',
    messageId,
    serverDB: {} as never,
    toolManifestMap: {},
    userId: 'user',
    workspaceId: 'workspace',
  });
const args = {
  criteria: [{ title: 'Both files exist' }],
  instruction: 'Deliver files',
  name: 'Delivery',
  tasks: [{ title: 'Alpha', description: 'Exactly Alpha' }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({
    orchestrationWorkflowId: 'split',
    parentTaskId: 'parent',
    taskIds: ['alpha'],
  });
  mocks.release.mockResolvedValue({ orchestrationWorkflowId: 'split', parentTaskId: 'parent' });
  mocks.advance.mockResolvedValue({ result: { message: 'Started Issue' } });
});
describe('conversation split runtime', () => {
  it('creates the board split without scheduling execution or opening an approval dialog', async () => {
    const result = await runtime().prepareOrchestrationWorkflow(args);
    expect(result.state).toMatchObject({
      orchestrationWorkflowId: 'split',
      waitingReason: 'plan_not_confirmed',
    });
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ tasks: args.tasks }), {
      agentId: 'orchestrator',
      topicId: 'conversation',
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.advance).not.toHaveBeenCalled();
  });
  it('passes the server source message to the release guard before scheduling a dispatch', async () => {
    await runtime().startOrchestrationWorkflow({ orchestrationWorkflowId: 'split' });
    expect(mocks.release).toHaveBeenCalledWith('split', {
      agentId: 'orchestrator',
      topicId: 'conversation',
      sourceMessageId: 'user-reply',
    });
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(mocks.advance).toHaveBeenCalledOnce();
  });
  it('schedules no execution when the server refuses the reply receipt', async () => {
    mocks.release.mockRejectedValue(new Error('AWAITING_USER_REPLY'));
    await expect(
      runtime().startOrchestrationWorkflow({ orchestrationWorkflowId: 'split' }),
    ).rejects.toThrow('AWAITING_USER_REPLY');
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it('reports a released split truthfully if the immediate dispatch is unavailable', async () => {
    mocks.advance.mockRejectedValue(new Error('Device offline'));
    const result = await runtime().startOrchestrationWorkflow({ orchestrationWorkflowId: 'split' });
    expect(result.success).toBe(true);
    expect(result.content).toContain('execution is waiting');
    expect(result.content).toContain('Do not create it again');
  });
});
