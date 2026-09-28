import { MemorySourceType } from '@orvilo/types';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MemoryExtractModule from '@/server/services/memory/userMemory/extract';

const mocks = vi.hoisted(() => ({
  filterMemoryExtractionEnabledUsers: vi.fn(),
  runDirect: vi.fn(),
  triggerProcessUsers: vi.fn(),
}));

vi.mock('@/server/globalConfig/parseMemoryExtractionConfig', () => ({
  parseMemoryExtractionConfig: () => ({
    webhook: { headers: { 'x-memory-secret': 'secret' } },
    workflowExtraHeaders: {},
  }),
}));

vi.mock('@/server/services/memory/userMemory/gate', () => ({
  filterMemoryExtractionEnabledUsers: mocks.filterMemoryExtractionEnabledUsers,
}));

vi.mock('@/server/services/memory/userMemory/extract', async (importOriginal) => {
  const actual = await importOriginal<typeof MemoryExtractModule>();

  return {
    ...actual,
    MemoryExtractionExecutor: {
      create: vi.fn(async () => ({ runDirect: mocks.runDirect })),
    },
    MemoryExtractionWorkflowService: {
      triggerProcessUsers: mocks.triggerProcessUsers,
    },
  };
});

const { memoryExtractionWebhook } = await import('../memoryExtraction');
const { memoryWebhookAuth } = await import('../../middlewares/memoryWebhookAuth');

/**
 * Mounts just this route rather than the whole webhooks app — importing the app
 * index would drag in every sibling handler (model-runtime, db clients, …).
 */
const app = new Hono().basePath('/api/webhooks');
app.post('/memory-extraction', memoryWebhookAuth(), memoryExtractionWebhook);

const createRequest = (body: Record<string, unknown>) =>
  new Request('https://app.example.com/api/webhooks/memory-extraction', {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-memory-secret': 'secret',
    },
    method: 'POST',
  });

describe('memory extraction webhook memory-enabled gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filterMemoryExtractionEnabledUsers.mockImplementation(async (userIds: string[]) => ({
      enabledUserIds: userIds,
      skippedUserIds: [],
    }));
    mocks.triggerProcessUsers.mockResolvedValue({ workflowRunId: 'run-1' });
    mocks.runDirect.mockResolvedValue({ extracted: 1 });
  });

  it('schedules only memory-enabled users when some targets disabled memory', async () => {
    /**
     * @example
     * const response = await app.fetch(createRequest({ userIds: ['u1', 'u2'] }));
     */
    mocks.filterMemoryExtractionEnabledUsers.mockResolvedValue({
      enabledUserIds: ['u1'],
      skippedUserIds: ['u2'],
    });

    const response = await app.fetch(
      createRequest({
        baseUrl: 'https://app.example.com',
        sources: [MemorySourceType.ChatTopic],
        userIds: ['u1', 'u2'],
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      skippedUserIds: ['u2'],
      workflowRunId: 'run-1',
    });
    expect(mocks.triggerProcessUsers).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['u1'] }),
      expect.anything(),
    );
  });

  it('schedules nothing when every target user disabled memory', async () => {
    /**
     * @example
     * const response = await app.fetch(createRequest({ userIds: ['u1'] }));
     */
    mocks.filterMemoryExtractionEnabledUsers.mockResolvedValue({
      enabledUserIds: [],
      skippedUserIds: ['u1'],
    });

    const response = await app.fetch(
      createRequest({
        baseUrl: 'https://app.example.com',
        sources: [MemorySourceType.ChatTopic],
        userIds: ['u1'],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      skippedUserIds: ['u1'],
    });
    expect(mocks.triggerProcessUsers).not.toHaveBeenCalled();
    expect(mocks.runDirect).not.toHaveBeenCalled();
  });

  it('runs inline extraction only for memory-enabled users in direct mode', async () => {
    /**
     * @example
     * const response = await app.fetch(createRequest({ mode: 'direct', userIds: ['u1'] }));
     */
    const response = await app.fetch(
      createRequest({
        baseUrl: 'https://app.example.com',
        mode: 'direct',
        sources: [MemorySourceType.ChatTopic],
        userIds: ['u1'],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.runDirect).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['u1'] }));
    expect(mocks.triggerProcessUsers).not.toHaveBeenCalled();
  });
});
