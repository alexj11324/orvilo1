// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const triggerMock = vi.fn();

vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'http://localhost:3011',
    enableQueueAgentRuntime: true,
    INTERNAL_APP_URL: 'http://localhost:3011',
  },
}));

vi.mock('@/server/services/hatchet/workflows', () => ({
  triggerHatchetWorkflow: triggerMock,
}));

describe('AgentSignalWorkflow', () => {
  beforeEach(() => {
    triggerMock.mockReset();
    triggerMock.mockResolvedValue({ workflowRunId: 'wfr_agent_signal' });
  });

  it('uses a stable Hatchet lane while preserving the workflow payload scope key', async () => {
    const { AgentSignalWorkflow } = await import('./agentSignal');

    await AgentSignalWorkflow.triggerRun({
      agentId: 'agent-1',
      sourceEvent: {
        payload: {
          message: 'Remember this',
          messageId: 'msg-1',
          topicId: 'topic-1',
        },
        scopeKey: 'topic:topic-1',
        sourceId: 'source-1',
        sourceType: 'agent.user.message',
        timestamp: 1710000000000,
      },
      userId: 'user-1',
    });

    expect(triggerMock).toHaveBeenCalledWith(
      '/api/workflows/agent-signal/run',
      {
        agentId: 'agent-1',
        sourceEvent: {
          payload: {
            message: 'Remember this',
            messageId: 'msg-1',
            topicId: 'topic-1',
          },
          scopeKey: 'topic:topic-1',
          sourceId: 'source-1',
          sourceType: 'agent.user.message',
          timestamp: 1710000000000,
        },
        userId: 'user-1',
      },
      {
        concurrencyKey: 'agent-signal.run.scope.topic:topic-1',
        headers: {},
      },
    );
  });
});
