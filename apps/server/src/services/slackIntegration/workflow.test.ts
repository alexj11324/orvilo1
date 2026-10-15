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
