// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// serverDatabase middleware calls getServerDB(); the model mocks below ignore
// the db handle anyway.
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return {};
  }),
}));

// Pass the RBAC gate through — this suite exercises the mutation body, not the
// permission mapping (covered for other routers by the GATE sentinel pattern).
vi.mock('@/business/server/trpc-middlewares/rbacPermission', () => ({
  withScopedPermission: vi.fn(function () {
    return async (opts: { ctx: unknown; next: (o: { ctx: unknown }) => unknown }) =>
      opts.next({ ctx: opts.ctx });
  }),
}));

// Workspace membership resolution feeds ctx.workspaceRole.
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));

const mockFindTaskById = vi.fn();
const mockTaskUpdate = vi.fn();

vi.mock('@/database/models/task', async (importOriginal) => ({
  ...(await importOriginal()),
  TaskModel: vi.fn(function () {
    return { findById: mockFindTaskById, update: mockTaskUpdate };
  }),
}));

const mockFindTeamById = vi.fn();
const mockHasWriteAccess = vi.fn();

vi.mock('@/database/models/team', async (importOriginal) => ({
  ...(await importOriginal()),
  TeamModel: vi.fn(function () {
    return { findById: mockFindTeamById, hasWriteAccess: mockHasWriteAccess };
  }),
}));

// Imported after the mocks above are registered.
const { workAttentionRouter } = await import('../workAttention');

const createCaller = () =>
  workAttentionRouter.createCaller({
    serverDB: {},
    userId: 'user-1',
    workspaceId: 'ws-1',
  } as never);

describe('workAttention.triage — retriage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasWriteAccess.mockResolvedValue(true);
    mockFindTeamById.mockResolvedValue({ id: 'team-1' });
    mockFindTaskById.mockResolvedValue({ id: 'task-1', teamId: 'team-1' });
  });

  it('sends the task back to intake as untriaged and clears the duplicate link', async () => {
    mockTaskUpdate.mockResolvedValue({ id: 'task-1', triageStatus: 'untriaged' });

    await expect(
      createCaller().triage({
        action: 'retriage',
        expectedDomainRevision: 3,
        taskId: 'task-1',
        teamId: 'team-1',
      }),
    ).resolves.toMatchObject({ success: true });

    expect(mockTaskUpdate).toHaveBeenCalledWith(
      'task-1',
      { duplicateOfTaskId: null, triageStatus: 'untriaged' },
      { expectedDomainRevision: 3, source: 'user' },
    );
  });

  it('still honors the optimistic-revision guard for retriage', async () => {
    mockTaskUpdate.mockRejectedValue(new Error('boom'));

    await expect(
      createCaller().triage({
        action: 'retriage',
        expectedDomainRevision: 3,
        taskId: 'task-1',
        teamId: 'team-1',
      }),
    ).rejects.toThrow('boom');
    expect(mockTaskUpdate).toHaveBeenCalledTimes(1);
  });
});
