import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  orchestrator: vi.fn(),
  advanceOrchestrationWorkflow: vi.fn(),
  create: vi.fn(),
  scheduleOrchestrationWorkflowAdvance: vi.fn(),
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getOrchestratorSourceAgentId = mocks.orchestrator;
  },
}));

vi.mock('@/server/services/orchestrationWorkflow', () => ({
  OrchestrationWorkflowService: vi.fn(function () {
    return { create: mocks.create };
  }),
}));
vi.mock('@/server/services/orchestrationWorkflow/advanceOrchestrationWorkflow', () => ({
  advanceOrchestrationWorkflow: mocks.advanceOrchestrationWorkflow,
}));
vi.mock('@/server/services/orchestrationWorkflow/scheduler', () => ({
  scheduleOrchestrationWorkflowAdvance: mocks.scheduleOrchestrationWorkflowAdvance,
}));

const { orchestrationWorkflowRuntime } = await import('../orchestrationWorkflow');

const runtime = () =>
  orchestrationWorkflowRuntime.factory({
    orchestrationWorkflowPlanApproved: true,
    agentId: 'agt_1',
    serverDB: {} as never,
    toolManifestMap: {},
    userId: 'user-1',
    workspaceId: 'ws-1',
  } as never);

const args = {
  criteria: [{ title: 'It works' }],
  instruction: 'do the thing',
  name: 'An orchestration workflow',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.orchestrator.mockResolvedValue('agt_1');
  mocks.create.mockResolvedValue({
    orchestrationWorkflow: { id: 'orchestration_workflow_1', title: 'An orchestration workflow' },
  });
});

describe('orchestrationWorkflowRuntime.startOrchestrationWorkflow', () => {
  it('refuses direct execution without a recorded human confirmation', async () => {
    const tool = orchestrationWorkflowRuntime.factory({
      agentId: 'agt_1',
      serverDB: {},
      userId: 'user-1',
    } as never);
    expect((await tool.startOrchestrationWorkflow(args)).success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('refuses a normal Agent even when a plan was confirmed', async () => {
    mocks.orchestrator.mockResolvedValue('other-agent');
    expect((await runtime().startOrchestrationWorkflow(args)).success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('queues the advance so a failed kickoff is genuinely recoverable', async () => {
    // This path calls OrchestrationWorkflowService directly, so nothing else schedules the orchestration workflow.
    // Without the queued advance the "the server will pick it up" message below
    // is false and the orchestration workflow sits in `planning` forever.
    mocks.advanceOrchestrationWorkflow.mockRejectedValue(new Error('runner offline'));

    const result = await runtime().startOrchestrationWorkflow(args);

    expect(mocks.scheduleOrchestrationWorkflowAdvance).toHaveBeenCalledWith({
      orchestrationWorkflowId: 'orchestration_workflow_1',
      // The label survives the queue hop onto the trajectory, so a run can be
      // sliced by what drove it — asserted here rather than left loose.
      trigger: 'create',
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
    expect(result.success).toBe(true);
    expect(result.content).toContain('Do not create it again');
  });

  it('reports the started orchestration workflow when the kickoff succeeds', async () => {
    mocks.advanceOrchestrationWorkflow.mockResolvedValue({
      result: { message: 'Started task T-1', taskId: 't1' },
    });

    const result = await runtime().startOrchestrationWorkflow(args);

    expect(mocks.scheduleOrchestrationWorkflowAdvance).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.content).toContain('Started task T-1');
  });
});
