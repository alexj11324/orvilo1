// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return {};
  }),
}));

const mockCountTasks = vi.fn(async () => ({ queryHash: 'h', total: 0 }));
const mockQueryProjects = vi.fn(async () => ({ data: [], queryHash: 'h', total: 0 }));

vi.mock('@/database/models/workQuery', async (importOriginal) => ({
  ...(await importOriginal),
  WorkQueryModel: vi.fn(function () {
    return { countTasks: mockCountTasks, queryProjects: mockQueryProjects };
  }),
}));

vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));

const { workAttentionRouter } = await import('../workAttention');

const createCaller = () =>
  workAttentionRouter.createCaller({ serverDB: {}, userId: 'user-1', workspaceId: 'ws-1' } as any);

const baseQuery = (filter: unknown) => ({
  entityType: 'task',
  filter,
  schemaVersion: 1,
});

describe('workAttention.count — query filter schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves a predicate inside `all` instead of collapsing it to an empty filter', async () => {
    await createCaller().count({
      query: baseQuery({ all: [{ field: 'status', op: 'eq', value: 'backlog' }] }),
    });

    expect(mockCountTasks).toHaveBeenCalledWith({
      query: expect.objectContaining({
        filter: { all: [{ field: 'status', op: 'eq', value: 'backlog' }] },
      }),
    });
  });

  it('supports a root `any` (OR) group', async () => {
    const filter = {
      any: [
        { field: 'status', op: 'eq', value: 'backlog' },
        { field: 'status', op: 'eq', value: 'running' },
      ],
    };
    await createCaller().count({ query: baseQuery(filter) });

    expect(mockCountTasks).toHaveBeenCalledWith({
      query: expect.objectContaining({ filter }),
    });
  });

  it('preserves nested AND/OR combinations', async () => {
    const filter = {
      all: [
        { field: 'teamId', op: 'isNotNull' },
        {
          any: [
            { field: 'priority', op: 'eq', value: 'urgent' },
            { all: [{ field: 'status', op: 'in', value: ['todo', 'in_progress'] }] },
          ],
        },
      ],
    };
    await createCaller().count({ query: baseQuery(filter) });

    expect(mockCountTasks).toHaveBeenCalledWith({
      query: expect.objectContaining({ filter }),
    });
  });

  it('passes currentUser reference values through', async () => {
    const filter = { all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }] };
    await createCaller().count({ query: baseQuery(filter) });

    expect(mockCountTasks).toHaveBeenCalledWith({
      query: expect.objectContaining({ filter }),
    });
  });

  it('accepts an empty filter object for name-only view queries', async () => {
    await createCaller().count({ query: baseQuery({}) });
    expect(mockCountTasks).toHaveBeenCalledWith({
      query: expect.objectContaining({ filter: {} }),
    });
  });

  it('rejects a predicate with an illegal field', async () => {
    await expect(
      createCaller().count({ query: baseQuery({ all: [{ field: 'hax', op: 'eq', value: 1 }] }) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockCountTasks).not.toHaveBeenCalled();
  });

  it('rejects unknown keys on filter groups instead of stripping them', async () => {
    await expect(
      createCaller().count({ query: baseQuery({ all: [], nope: true }) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects an illegal op', async () => {
    await expect(
      createCaller().count({
        query: baseQuery({ all: [{ field: 'status', op: 'contains', value: 'x' }] }),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
