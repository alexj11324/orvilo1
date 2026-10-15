import { EventEmitter } from 'node:events';

import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ChatRuntime from './chatRuntime';
import { runSlackIntegrationEvent } from './workflow';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  runtime: vi.fn(),
  dispatch: vi.fn(),
  redis: null as Redis | null,
  topic: vi.fn(),
  operations: vi.fn(),
  messages: vi.fn(),
}));
vi.mock('@/database/models/topic', () => ({
  TopicModel: class {
    findOwnTopicById = mocks.topic;
  },
}));
vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: class {
    listByTopic = mocks.operations;
  },
}));
vi.mock('@/database/models/message', () => ({
  MessageModel: class {
    query = mocks.messages;
  },
}));
vi.mock('@orvilo/openapi/src/services/responses.service', () => ({ ResponsesService: class {} }));
vi.mock('@/database/server', () => ({ getServerDB: async () => ({}) }));
vi.mock('.', () => ({
  createSlackIntegrationService: () => ({
    getInstallationByTeamId: mocks.lookup,
    getBotToken: async () => 'test-token',
  }),
}));
vi.mock('./chatRuntime', () => ({ getSlackChatRuntime: mocks.runtime }));
vi.mock('./nativeReply', () => ({
  resolvePendingSlackReply: vi.fn(),
  submitPendingSlackReply: vi.fn(),
}));
vi.mock('@/server/modules/AgentExecution/redis', () => ({
  getAgentRuntimeRedisClient: () => mocks.redis,
}));
vi.mock('@/envs/slack', () => ({ slackEnv: { SLACK_SIGNING_SECRET: 'test-secret' } }));

const input = {
  body: { team_id: 'T1' },
  conversationKey: 'thread',
  installationId: 'install',
  teamId: 'T1',
  tokenRevision: 'original',
};
describe('queued Slack installation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis = Object.assign(new EventEmitter(), { status: 'ready' }) as Redis;
    mocks.runtime.mockResolvedValue({ dispatch: mocks.dispatch });
  });
  it.each([
    null,
    { id: 'install', tokenRevision: 'replacement' },
    { id: 'new-install', tokenRevision: 'original' },
  ])(
    'does not execute a delivery after its installation was disconnected or replaced',
    async (installation) => {
      mocks.lookup.mockResolvedValue(installation);
      expect(await runSlackIntegrationEvent(input)).toEqual({ skipped: true });
      expect(mocks.runtime).not.toHaveBeenCalled();
    },
  );
  it('dispatches through Chat SDK only while the original grant exists', async () => {
    mocks.lookup.mockResolvedValue({ id: 'install', slackTeamId: 'T1', tokenRevision: 'original' });
    expect(await runSlackIntegrationEvent(input)).toEqual({ success: true });
    expect(mocks.dispatch).toHaveBeenCalledWith(input.body);
  });
  it.each([
    null,
    { userId: 'other', agentId: 'agent', trigger: 'slack' },
    { userId: 'human', agentId: 'other', trigger: 'slack' },
    { userId: 'human', agentId: 'agent', trigger: 'chat' },
  ])(
    'does not recover a response outside its original Slack owner and Agent (%s)',
    async (topic) => {
      mocks.lookup.mockResolvedValue({
        id: 'install',
        slackTeamId: 'T1',
        tokenRevision: 'original',
      });
      mocks.topic.mockResolvedValue(topic);
      await runSlackIntegrationEvent(input);
      const deps = mocks.runtime.mock.calls[0][1]() as ChatRuntime.SlackChatDependencies;
      expect(
        await deps.resolveCompletedResponse!({
          agentId: 'agent',
          responseId: 'topic',
          userId: 'human',
          workspaceId: 'workspace',
        }),
      ).toBeNull();
      expect(mocks.operations).not.toHaveBeenCalled();
      expect(mocks.messages).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, 'running', 'error', 'waiting_for_human'])(
    'keeps a non-completed latest operation unresolved (%s)',
    async (status) => {
      mocks.lookup.mockResolvedValue({
        id: 'install',
        slackTeamId: 'T1',
        tokenRevision: 'original',
      });
      mocks.topic.mockResolvedValue({ userId: 'human', agentId: 'agent', trigger: 'slack' });
      mocks.operations.mockResolvedValue(
        status ? [{ agentId: 'agent', status, trigger: 'slack' }] : [],
      );
      await runSlackIntegrationEvent(input);
      const deps = mocks.runtime.mock.calls[0][1]() as ChatRuntime.SlackChatDependencies;
      expect(
        await deps.resolveCompletedResponse!({
          agentId: 'agent',
          responseId: 'topic',
          userId: 'human',
          workspaceId: 'workspace',
        }),
      ).toBeNull();
      expect(mocks.messages).not.toHaveBeenCalled();
    },
  );
  it('recovers only the final actual assistant text after its latest Slack operation completed', async () => {
    mocks.lookup.mockResolvedValue({ id: 'install', slackTeamId: 'T1', tokenRevision: 'original' });
    mocks.topic.mockResolvedValue({ userId: 'human', agentId: 'agent', trigger: 'slack' });
    mocks.operations.mockResolvedValue([{ agentId: 'agent', status: 'done', trigger: 'slack' }]);
    mocks.messages.mockResolvedValue([
      { role: 'assistant', content: 'old answer' },
      { role: 'assistant', content: 'actual final answer' },
    ]);
    await runSlackIntegrationEvent(input);
    const deps = mocks.runtime.mock.calls[0][1]() as ChatRuntime.SlackChatDependencies;
    expect(
      await deps.resolveCompletedResponse!({
        agentId: 'agent',
        responseId: 'topic',
        userId: 'human',
        workspaceId: 'workspace',
      }),
    ).toBe('actual final answer');
    expect(mocks.topic).toHaveBeenCalledWith('topic');
    expect(mocks.operations).toHaveBeenCalledWith('topic', 1);
    expect(mocks.messages).toHaveBeenCalledWith({ topicId: 'topic' });
  });
  it('reuses one native Redis adapter across 25 cached queued deliveries', async () => {
    const actual = await vi.importActual<typeof ChatRuntime>('./chatRuntime');
    const redis = Object.assign(new EventEmitter(), { status: 'ready' }) as Redis;
    mocks.redis = redis;
    mocks.lookup.mockResolvedValue({
      id: 'install',
      slackTeamId: 'T1',
      botUserId: 'UBOT',
      tokenRevision: 'original',
    });
    mocks.runtime.mockImplementation(actual.getSlackChatRuntime);
    const listeners = redis.listenerCount('error');
    try {
      for (let index = 0; index < 25; index++)
        expect(await runSlackIntegrationEvent(input)).toEqual({ success: true });
      expect(redis.listenerCount('error')).toBe(listeners + 1);
    } finally {
      await actual.stopSlackChatRuntime('T1');
      mocks.redis = null;
    }
  });
});
