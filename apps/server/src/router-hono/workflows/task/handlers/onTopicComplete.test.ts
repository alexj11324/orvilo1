// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onTopicComplete } from './onTopicComplete';

const { getServerDBMock, lifecycleComplete } = vi.hoisted(() => ({
  getServerDBMock: vi.fn(),
  lifecycleComplete: vi.fn(),
}));

vi.mock('@/database/server', () => ({ getServerDB: getServerDBMock }));
vi.mock('@/server/services/taskLifecycle', () => ({
  TaskLifecycleService: vi.fn(function () {
    return { onTopicComplete: lifecycleComplete };
  }),
}));

const query = (row: unknown) => ({
  from: () => ({
    where: () => ({ limit: async () => (row ? [row] : []) }),
  }),
});

const context = (overrides: Record<string, unknown> = {}) => {
  const json = vi.fn((body: unknown, status = 200) => ({ body, status }));
  return {
    c: {
      json,
      req: {
        json: async () => ({
          operationId: 'op-1',
          reason: 'done',
          taskId: 'task-1',
          taskIdentifier: 'TASK-1',
          topicId: 'topic-1',
          userId: 'user-1',
          ...overrides,
        }),
      },
    } as any,
    json,
  };
};

describe('task on-topic-complete webhook', () => {
  beforeEach(() => {
    lifecycleComplete.mockReset();
    getServerDBMock.mockReset();
  });

  it('returns 503 when the durable callback beats task-topic registration', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(
        query({
          status: 'done',
          taskId: 'task-1',
          topicId: 'topic-1',
          userId: 'user-1',
          workspaceId: null,
        }),
      )
      .mockReturnValueOnce(
        query({ currentTopicId: null, identifier: 'TASK-1', status: 'running', workspaceId: null }),
      )
      .mockReturnValueOnce(query(undefined));
    getServerDBMock.mockResolvedValue({ select });
    const { c } = context();

    const response = await onTopicComplete(c);

    expect(response).toMatchObject({ status: 503 });
    expect(lifecycleComplete).not.toHaveBeenCalled();
  });

  it('returns 503 between current-topic update and task-topic insertion', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(
        query({
          status: 'done',
          taskId: 'task-1',
          topicId: 'topic-1',
          userId: 'user-1',
          workspaceId: null,
        }),
      )
      .mockReturnValueOnce(
        query({
          currentTopicId: 'topic-1',
          identifier: 'TASK-1',
          status: 'running',
          workspaceId: null,
        }),
      )
      .mockReturnValueOnce(query(undefined));
    getServerDBMock.mockResolvedValue({ select });
    const { c } = context();

    const response = await onTopicComplete(c);

    expect(response).toMatchObject({ status: 503 });
    expect(lifecycleComplete).not.toHaveBeenCalled();
  });

  it('acknowledges a stale callback without driving the current generation', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(
        query({
          status: 'done',
          taskId: 'task-1',
          topicId: 'topic-1',
          userId: 'user-1',
          workspaceId: null,
        }),
      )
      .mockReturnValueOnce(
        query({
          currentTopicId: 'topic-new',
          identifier: 'TASK-1',
          status: 'running',
          workspaceId: null,
        }),
      )
      .mockReturnValueOnce(query({ operationId: 'op-1' }));
    getServerDBMock.mockResolvedValue({ select });
    const { c } = context();

    const response = await onTopicComplete(c);

    expect(response).toMatchObject({ body: { ignored: true, success: true }, status: 200 });
    expect(lifecycleComplete).not.toHaveBeenCalled();
  });

  it('rejects a callback until the operation itself is terminal', async () => {
    const select = vi.fn().mockReturnValueOnce(
      query({
        status: 'running',
        taskId: 'task-1',
        topicId: 'topic-1',
        userId: 'user-1',
        workspaceId: null,
      }),
    );
    getServerDBMock.mockResolvedValue({ select });
    const { c } = context();

    const response = await onTopicComplete(c);

    expect(response).toMatchObject({ status: 409 });
    expect(lifecycleComplete).not.toHaveBeenCalled();
  });

  it('normalizes a capped successful run to done', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(
        query({
          status: 'done',
          taskId: 'task-1',
          topicId: 'topic-1',
          userId: 'user-1',
          workspaceId: null,
        }),
      )
      .mockReturnValueOnce(
        query({
          currentTopicId: 'topic-1',
          identifier: 'TASK-1',
          status: 'running',
          workspaceId: null,
        }),
      )
      .mockReturnValueOnce(query({ operationId: 'op-1' }));
    getServerDBMock.mockResolvedValue({ select });
    const { c } = context({ reason: 'max_steps' });

    const response = await onTopicComplete(c);

    expect(response).toMatchObject({ status: 200 });
    expect(lifecycleComplete).toHaveBeenCalledWith(expect.objectContaining({ reason: 'done' }));
  });
});
