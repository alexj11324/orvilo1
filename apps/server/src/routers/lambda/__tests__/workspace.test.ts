// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaceRouter } from '@/business/server/lambda-routers/workspace';

const { memberModel, queries, audit, workspaceModel } = vi.hoisted(() => ({
  audit: {
    emitWorkspaceEvent: vi.fn(),
    recordAudit: vi.fn(),
  },
  memberModel: {
    addMember: vi.fn(),
    getMember: vi.fn(),
    getMemberForUpdate: vi.fn(),
    listMembers: vi.fn(),
    removeMember: vi.fn(),
    resumeMember: vi.fn(),
    suspendMember: vi.fn(),
    updateMemberRole: vi.fn(),
  },
  queries: {
    bumpAuthzVersion: vi.fn(),
    countActiveDelegations: vi.fn(),
    countMemberBoundDevices: vi.fn(),
    countOpenTasksAssignedTo: vi.fn(),
    countOpenTasksReviewedBy: vi.fn(),
    findProjectsByIds: vi.fn(),
    findUserById: vi.fn(),
    findUsersByNormalizedEmail: vi.fn(),
    listMembersWithProfiles: vi.fn(),
    listOpenAssignedTaskTitles: vi.fn(),
    lockMembershipForUpdate: vi.fn(),
    lockWorkspaceForUpdate: vi.fn(),
    reassignOpenAssignedTasks: vi.fn(),
  },
  workspaceModel: {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    listUserWorkspaces: vi.fn(),
    transferPrimaryOwnership: vi.fn(),
  },
}));

vi.mock('@/business/server/membershipLifecycle/audit', () => audit);
vi.mock('@/business/server/membershipLifecycle/queries', () => queries);

vi.mock('@/database/models/workspace', () => ({
  WorkspaceModel: vi.fn(function () {
    return workspaceModel;
  }),
}));
vi.mock('@/database/models/workspaceMember', () => ({
  WorkspaceMemberModel: vi.fn(function () {
    return memberModel;
  }),
}));

vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { authedProcedure } = await import('@/libs/trpc/lambda');
  const { trpc } = await import('@/libs/trpc/lambda/init');
  const pass = () => trpc.middleware(async (opts: any) => opts.next({ ctx: opts.ctx }));
  return {
    requireWorkspaceRole: pass,
    requireWorkspaceRoleWhenScoped: pass,
    wsAdminProcedure: authedProcedure,
    wsCompatProcedure: authedProcedure,
    wsMemberProcedure: authedProcedure,
    wsOwnerProcedure: authedProcedure,
    wsProcedure: authedProcedure,
  };
});

vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
}));

const fakeDb: any = {};
fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));

const createCaller = (overrides: Record<string, unknown> = {}) =>
  workspaceRouter.createCaller({
    clientIp: '10.0.0.1',
    serverDB: fakeDb,
    userId: 'u-owner',
    workspaceId: 'ws-1',
    workspaceRole: 'owner',
    ...overrides,
  } as any);

describe('workspaceRouter.getById', () => {
  it('returns null in the community build', async () => {
    const caller = workspaceRouter.createCaller({
      serverDB: {},
      userId: 'user-1',
      workspaceId: 'ignored-community-workspace',
    } as never);

    await expect(caller.getById()).resolves.toBeNull();
  });
});

describe('workspaceRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));
    workspaceModel.create.mockResolvedValue({
      id: 'ws-new',
      name: 'Team',
      primaryOwnerId: 'u-owner',
      slug: 'team',
    });
    workspaceModel.findBySlug.mockResolvedValue(undefined);
    workspaceModel.listUserWorkspaces.mockResolvedValue([
      { id: 'ws-1', name: 'Team', role: 'owner', slug: 'team' },
    ]);
    memberModel.getMember.mockResolvedValue({ role: 'admin' });
    workspaceModel.transferPrimaryOwnership.mockResolvedValue({
      newPrimaryOwnerUserId: 'u-admin',
      previousPrimaryOwnerUserId: 'u-owner',
      workspaceId: 'ws-1',
    });
  });

  it('creates the workspace under the session user — owner is never client input', async () => {
    const created = await createCaller().create({ name: 'Team', slug: 'team' });

    expect(workspaceModel.create).toHaveBeenCalledWith({
      avatar: undefined,
      description: undefined,
      name: 'Team',
      slug: 'team',
    });
    expect(created.primaryOwnerId).toBe('u-owner');
  });

  it('reports a taken slug as CONFLICT on create', async () => {
    workspaceModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(createCaller().create({ name: 'Team', slug: 'taken' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('lists the caller memberships with their roles', async () => {
    const rows = await createCaller().list();
    expect(rows).toEqual([{ id: 'ws-1', name: 'Team', role: 'owner', slug: 'team' }]);
  });

  it('checks slug availability against the real table', async () => {
    expect(await createCaller().checkSlugAvailable({ slug: 'free-slug' })).toEqual({
      available: true,
    });
    workspaceModel.findBySlug.mockResolvedValue({ id: 'ws-1' });
    expect(await createCaller().checkSlugAvailable({ slug: 'team' })).toEqual({
      available: false,
    });
  });

  it('transfers ownership to an active admin member', async () => {
    const result = await createCaller().transferOwnership({ newOwnerUserId: 'u-admin' });

    expect(workspaceModel.transferPrimaryOwnership).toHaveBeenCalledWith('ws-1', 'u-admin');
    expect(result).toEqual({ transferred: true });
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'ownership.transferred' }),
    );
    expect(audit.emitWorkspaceEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ eventType: 'workspace.ownership.transferred' }),
    );
  });

  it('rejects transferring to a non-member or to yourself', async () => {
    memberModel.getMember.mockResolvedValue(undefined);
    await expect(
      createCaller().transferOwnership({ newOwnerUserId: 'u-stranger' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await expect(
      createCaller().transferOwnership({ newOwnerUserId: 'u-owner' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(workspaceModel.transferPrimaryOwnership).not.toHaveBeenCalled();
  });
});
