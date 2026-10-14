import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponsesService } from '../responses.service';

const mocks = vi.hoisted(() => ({ start: vi.fn(), metadata: vi.fn() }));
vi.mock('@/database/models/message', () => ({ MessageModel: class {} }));
vi.mock('@/server/services/agentExecution/CompletionLifecycle', () => ({
  extractTextFromMessage: vi.fn(),
  findLastAssistantMessage: vi.fn(),
  normalizeCompletionMessages: vi.fn(),
}));
vi.mock('@/database/models/topic', () => ({
  TopicModel: class {
    updateMetadata = mocks.metadata;
  },
}));
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: class {
    execAgent = mocks.start;
  },
}));
vi.mock('@/server/modules/AgentExecution/InMemoryStreamEventManager', () => ({
  InMemoryStreamEventManager: class {},
}));
vi.mock('../../common/base.service', () => ({
  BaseService: class {
    constructor(
      public db: unknown,
      public userId: string,
      public workspaceId?: string,
    ) {}
    log() {}
  },
}));

describe('trusted Slack transport source', () => {
  beforeEach(() => {
    mocks.metadata.mockReset();
    mocks.start.mockReset().mockImplementation(async (params) => {
      await params.beforeOperationStart?.({
        topicId: 'source-topic',
        operationId: 'bound-operation',
      });
      return { success: false, error: 'stop before external dispatch' };
    });
  });

  it('ignores client metadata that tries to supply Slack channel defaults', async () => {
    const service = new ResponsesService({} as never, 'caller', 'workspace');
    await Array.fromAsync(
      service.createStreamingResponse({
        input: 'hello',
        model: 'saved-agent',
        metadata: { source: 'slack', repositoryId: 'forged' },
      }),
    );
    expect(mocks.start.mock.calls[0][0].trigger).toBe('openapi');
    expect(mocks.metadata).not.toHaveBeenCalled();
  });

  it('marks the bound source before dispatch and passes direct attachments through the existing ingestion path', async () => {
    const writes: unknown[] = [];
    const database = {
      update: () => ({
        set: (value: unknown) => {
          writes.push(value);
          return { where: async () => [] };
        },
      }),
    };
    const files = [{ buffer: Buffer.from('direct input'), name: 'input.txt' }];
    const service = new ResponsesService(database as never, 'caller', 'workspace', {
      files,
      projectId: 'project',
      repositoryId: 'repo',
    });
    await Array.fromAsync(
      service.createStreamingResponse({
        input: 'request',
        model: 'saved-agent',
        previous_response_id: 'source-topic',
      }),
    );
    const input = mocks.start.mock.calls[0][0];
    expect(input.trigger).toBe('slack');
    expect(input.appContext.topicId).toBe('source-topic');
    expect(input.files).toBe(files);
    expect(writes).toEqual([{ trigger: 'slack' }]);
    expect(mocks.metadata).toHaveBeenCalledWith('source-topic', {
      slackContext: { projectId: 'project', repositoryId: 'repo' },
    });
  });
});
