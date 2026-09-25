// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockServerDB = {
  select: mockSelect,
};

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return mockServerDB;
  }),
}));

vi.mock('@/business/server/trpc-middlewares/rbacPermission', () => ({
  withScopedPermission: vi.fn(function () {
    return async (opts: { ctx: unknown; next: (o: { ctx: unknown }) => unknown }) =>
      opts.next({ ctx: opts.ctx });
  }),
}));

vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));

const mockFindTaskById = vi.fn();

vi.mock('@/database/models/task', async (importOriginal) => ({
  ...(await importOriginal()),
  TaskModel: vi.fn(function () {
    return { findById: mockFindTaskById };
  }),
}));

const mockListByTask = vi.fn();
const mockSubscribeForUser = vi.fn();
const mockUnsubscribeForUser = vi.fn();

vi.mock('@/database/models/taskSubscription', async (importOriginal) => ({
  ...(await importOriginal()),
  TaskSubscriptionModel: vi.fn(function () {
    return {
      listByTask: mockListByTask,
      subscribeForUser: mockSubscribeForUser,
      unsubscribeForUser: mockUnsubscribeForUser,
    };
  }),
}));

const { workAttentionRouter } = await import('../workAttention');

const createCaller = (ctxOverrides: Record<string, unknown> = {}) =>
  workAttentionRouter.createCaller({
    serverDB: mockServerDB,
    userId: 'user-1',
    workspaceId: 'ws-1',
    ...ctxOverrides,
  } as never);

describe('workAttention.subscribers & setSubscriber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindTaskById.mockResolvedValue({ id: 'task-1', workspaceId: 'ws-1' });
    mockListByTask.mockResolvedValue([
      {
        createdAt: new Date(),
        id: 'sub-1',
        reason: 'assigned',
        taskId: 'task-1',
        userId: 'user-1',
      },
    ]);
    mockLimit.mockResolvedValue([{ userId: 'user-2' }]);
  });

  describe('subscribers query', () => {
    it('throws NOT_FOUND when task does not exist', async () => {
      mockFindTaskById.mockResolvedValue(null);

      await expect(createCaller().subscribers({ taskId: 'missing-task' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND', message: 'Task not found' }),
      );
    });

    it('returns mapped subscribers for task', async () => {
      const res = await createCaller().subscribers({ taskId: 'task-1' });
      expect(mockFindTaskById).toHaveBeenCalledWith('task-1');
      expect(mockListByTask).toHaveBeenCalledWith('task-1');
      expect(res).toEqual([{ reason: 'assigned', userId: 'user-1' }]);
    });
  });

  describe('setSubscriber mutation', () => {
    it('throws NOT_FOUND when task does not exist', async () => {
      mockFindTaskById.mockResolvedValue(null);

      await expect(
        createCaller().setSubscriber({ subscribed: true, taskId: 'missing', userId: 'user-1' }),
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND', message: 'Task not found' }));
    });

    describe('self-toggle (userId === ctx.userId)', () => {
      it('calls subscribeForUser when subscribing self without querying workspace members', async () => {
        const res = await createCaller().setSubscriber({
          subscribed: true,
          taskId: 'task-1',
          userId: 'user-1',
        });

        expect(res).toEqual({ message: 'Subscribed', success: true });
        expect(mockSubscribeForUser).toHaveBeenCalledWith('task-1', 'user-1');
        expect(mockSelect).not.toHaveBeenCalled();
      });

      it('calls unsubscribeForUser when unsubscribing self', async () => {
        const res = await createCaller().setSubscriber({
          subscribed: false,
          taskId: 'task-1',
          userId: 'user-1',
        });

        expect(res).toEqual({ message: 'Unsubscribed', success: true });
        expect(mockUnsubscribeForUser).toHaveBeenCalledWith('task-1', 'user-1');
        expect(mockSelect).not.toHaveBeenCalled();
      });
    });

    describe('manage-others (userId !== ctx.userId)', () => {
      it('throws FORBIDDEN if ctx.workspaceId is missing', async () => {
        const callerWithoutWs = createCaller({ workspaceId: undefined });

        await expect(
          callerWithoutWs.setSubscriber({
            subscribed: true,
            taskId: 'task-1',
            userId: 'user-2',
          }),
        ).rejects.toThrow(
          expect.objectContaining({ code: 'FORBIDDEN', message: 'Workspace task required' }),
        );
      });

      it('throws FORBIDDEN if task does not belong to caller workspace', async () => {
        mockFindTaskById.mockResolvedValue({ id: 'task-1', workspaceId: 'other-ws' });

        await expect(
          createCaller().setSubscriber({
            subscribed: true,
            taskId: 'task-1',
            userId: 'user-2',
          }),
        ).rejects.toThrow(
          expect.objectContaining({ code: 'FORBIDDEN', message: 'Workspace task required' }),
        );
      });

      it('throws NOT_FOUND when target user is not an active workspace member', async () => {
        mockLimit.mockResolvedValue([]);

        await expect(
          createCaller().setSubscriber({
            subscribed: true,
            taskId: 'task-1',
            userId: 'user-2',
          }),
        ).rejects.toThrow(
          expect.objectContaining({ code: 'NOT_FOUND', message: 'Workspace member not found' }),
        );
      });

      it('subscribes another user when target is a valid member', async () => {
        mockLimit.mockResolvedValue([{ userId: 'user-2' }]);

        const res = await createCaller().setSubscriber({
          subscribed: true,
          taskId: 'task-1',
          userId: 'user-2',
        });

        expect(res).toEqual({ message: 'Subscribed', success: true });
        expect(mockSelect).toHaveBeenCalled();
        expect(mockSubscribeForUser).toHaveBeenCalledWith('task-1', 'user-2');
      });

      it('unsubscribes another user when target is a valid member', async () => {
        mockLimit.mockResolvedValue([{ userId: 'user-2' }]);

        const res = await createCaller().setSubscriber({
          subscribed: false,
          taskId: 'task-1',
          userId: 'user-2',
        });

        expect(res).toEqual({ message: 'Unsubscribed', success: true });
        expect(mockSelect).toHaveBeenCalled();
        expect(mockUnsubscribeForUser).toHaveBeenCalledWith('task-1', 'user-2');
      });
    });
  });
});
