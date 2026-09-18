import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunBot = vi.hoisted(() => vi.fn());
const mockRunMessenger = vi.hoisted(() => vi.fn());
const mockEnqueueHatchetTask = vi.hoisted(() => vi.fn().mockResolvedValue('hatchet-run:queued'));
const config = vi.hoisted(() => ({
  APP_URL: 'https://example.com',
  enableQueueAgentRuntime: false,
}));
vi.mock('@/envs/app', () => ({ appEnv: config }));
vi.mock('../BotMessageRouter', () => ({
  getBotMessageRouter: () => ({ replayDeferredMessages: mockRunBot }),
}));
vi.mock('@/server/services/messenger/MessengerRouter', () => ({
  getMessengerRouter: () => ({ replayDeferredMessages: mockRunMessenger }),
}));
vi.mock('@/libs/hatchet', () => ({ enqueueHatchetTask: mockEnqueueHatchetTask }));

const { scheduleDeferredReplay } = await import('../deferredReplay');
const target = { applicationId: 'app', platform: 'wechat', platformThreadId: 'wechat:single:user' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  config.enableQueueAgentRuntime = false;
  vi.stubEnv('AGENT_RUNTIME_BASE_URL', '');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('independent deferred replay retries', () => {
  it.each([false, true])(
    'retries a failed local delivery without another completion (messenger=%s)',
    async (messenger) => {
      const replay = messenger ? mockRunMessenger : mockRunBot;
      replay
        .mockRejectedValueOnce(new Error('temporary adapter error'))
        .mockResolvedValue(undefined);
      await scheduleDeferredReplay(
        { ...target, ...(messenger ? { messengerInstallationKey: 'wechat:singleton' } : {}) },
        'op-1',
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(replay).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(replay).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(replay).toHaveBeenCalledTimes(2);
    },
  );

  it('publishes a deduplicated replay-only job with bounded provider retries', async () => {
    config.enableQueueAgentRuntime = true;
    vi.stubEnv('HATCHET_CLIENT_TOKEN', 'example-token');
    await scheduleDeferredReplay(target, 'op-1');
    expect(mockEnqueueHatchetTask).toHaveBeenCalledWith(
      'orvilo-bot-replay',
      expect.objectContaining({
        deduplicationKey: expect.stringMatching(/^[a-f\d]{64}$/),
        endpoint: 'https://example.com/api/agent/webhooks/bot-replay',
        operationId: 'op-1',
        payload: target,
        retries: 8,
        retryDelay: '60000',
        stepIndex: 0,
      }),
      { delayMs: 1000, priority: 'normal' },
    );
    expect(mockEnqueueHatchetTask.mock.calls[0][1].payload).not.toHaveProperty(
      'lastAssistantContent',
    );
  });
});
