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
    countMemberWorkload: vi.fn(async () => new Map()),
    countOpenTasksAssignedTo: vi.fn(),
    countOpenTasksReviewedBy: vi.fn(),
    decideOwnershipTransfer: vi.fn(),
    findPendingOwnershipTransfer: vi.fn(),
    findProjectsByIds: vi.fn(),
    findUserById: vi.fn(),
    findUserProfiles: vi.fn(async (): Promise<any[]> => []),
    findUsersByNormalizedEmail: vi.fn(),
    insertOwnershipTransfer: vi.fn(),
    listMembersWithProfiles: vi.fn(),
    listOpenAssignedTaskTitles: vi.fn(),
    lockMembershipForUpdate: vi.fn(),
    lockPendingOwnershipTransferForUpdate: vi.fn(),
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

  it('recovers a retried create by returning the caller-owned same-slug workspace', async () => {
    workspaceModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    workspaceModel.findBySlug.mockResolvedValue({
      id: 'ws-existing',
      name: 'Team',
      primaryOwnerId: 'u-owner',
      slug: 'taken',
    });

    const recovered = await createCaller().create({ name: 'Team', slug: 'taken' });
    expect(recovered).toMatchObject({ id: 'ws-existing', slug: 'taken' });
  });

  it('keeps CONFLICT when the same-slug workspace belongs to someone else', async () => {
    workspaceModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    workspaceModel.findBySlug.mockResolvedValue({
      id: 'ws-other',
      primaryOwnerId: 'u-stranger',
      slug: 'taken',
    });

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

  it('creates a pending transfer request to an active admin member', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    queries.insertOwnershipTransfer.mockResolvedValue({ id: 'tr-1' });

    const result = await createCaller().transferOwnership({ newOwnerUserId: 'u-admin' });

    expect(queries.insertOwnershipTransfer).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ fromUserId: 'u-owner', toUserId: 'u-admin', workspaceId: 'ws-1' }),
    );
    expect(result.requested).toBe(true);
    // Nothing moves until the recipient accepts.
    expect(workspaceModel.transferPrimaryOwnership).not.toHaveBeenCalled();
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'workspace.ownership_transfer_requested' }),
    );
    expect(audit.emitWorkspaceEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ eventType: 'workspace.ownership_transfer.requested' }),
    );
  });

  it('rejects transferring to a non-member or to yourself', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    memberModel.getMember.mockResolvedValue(undefined);
    await expect(
      createCaller().transferOwnership({ newOwnerUserId: 'u-stranger' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await expect(
      createCaller().transferOwnership({ newOwnerUserId: 'u-owner' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(queries.insertOwnershipTransfer).not.toHaveBeenCalled();
  });

  it('rejects a request while one is still pending', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    queries.findPendingOwnershipTransfer.mockResolvedValue({ id: 'tr-open' });

    await expect(
      createCaller().transferOwnership({ newOwnerUserId: 'u-admin' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(queries.insertOwnershipTransfer).not.toHaveBeenCalled();
  });

  it('rejects a non-admin recipient up front', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    memberModel.getMember.mockResolvedValue({ role: 'member' });

    await expect(
      createCaller().transferOwnership({ newOwnerUserId: 'u-member' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('recipient acceptance runs the atomic swap and consumes the request', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    queries.lockPendingOwnershipTransferForUpdate.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      fromUserId: 'u-owner',
      id: 'tr-1',
      toUserId: 'u-admin',
    });
    const caller = createCaller({ userId: 'u-admin' });

    const result = await caller.respondOwnershipTransfer({ accept: true });

    expect(workspaceModel.transferPrimaryOwnership).toHaveBeenCalledWith('ws-1', 'u-admin');
    expect(queries.decideOwnershipTransfer).toHaveBeenCalledWith(fakeDb, 'tr-1', 'accepted');
    expect(result).toEqual({ accepted: true });
    expect(audit.emitWorkspaceEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ eventType: 'workspace.ownership.transferred' }),
    );
  });

  it('recipient decline closes the request without moving ownership', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    queries.lockPendingOwnershipTransferForUpdate.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      fromUserId: 'u-owner',
      id: 'tr-1',
      toUserId: 'u-admin',
    });
    const caller = createCaller({ userId: 'u-admin' });

    await caller.respondOwnershipTransfer({ accept: false });

    expect(workspaceModel.transferPrimaryOwnership).not.toHaveBeenCalled();
    expect(queries.decideOwnershipTransfer).toHaveBeenCalledWith(fakeDb, 'tr-1', 'declined');
  });

  it('only the invited member can respond', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    queries.lockPendingOwnershipTransferForUpdate.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      fromUserId: 'u-owner',
      id: 'tr-1',
      toUserId: 'u-admin',
    });
    const caller = createCaller({ userId: 'u-bystander' });

    await expect(caller.respondOwnershipTransfer({ accept: true })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(workspaceModel.transferPrimaryOwnership).not.toHaveBeenCalled();
  });

  it('an expired request is marked expired and rejected', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    queries.lockPendingOwnershipTransferForUpdate.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      fromUserId: 'u-owner',
      id: 'tr-1',
      toUserId: 'u-admin',
    });
    const caller = createCaller({ userId: 'u-admin' });

    await expect(caller.respondOwnershipTransfer({ accept: true })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(queries.decideOwnershipTransfer).toHaveBeenCalledWith(fakeDb, 'tr-1', 'expired');
  });

  it('owner can cancel a pending request; nobody else can', async () => {
    queries.lockWorkspaceForUpdate.mockResolvedValue({ primaryOwnerId: 'u-owner' });
    queries.lockPendingOwnershipTransferForUpdate.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      fromUserId: 'u-owner',
      id: 'tr-1',
      toUserId: 'u-admin',
    });

    await expect(
      createCaller({ userId: 'u-admin' }).cancelOwnershipTransfer(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const result = await createCaller().cancelOwnershipTransfer();
    expect(result).toEqual({ cancelled: true });
    expect(queries.decideOwnershipTransfer).toHaveBeenCalledWith(fakeDb, 'tr-1', 'cancelled');
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'workspace.ownership_transfer_cancelled' }),
    );
  });

  it('pendingOwnershipTransfer hides the request from uninvolved members', async () => {
    queries.findPendingOwnershipTransfer.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      fromUserId: 'u-owner',
      id: 'tr-1',
      toUserId: 'u-admin',
    });

    expect(await createCaller({ userId: 'u-bystander' }).pendingOwnershipTransfer()).toBeNull();

    queries.findUserProfiles.mockResolvedValue([
      { avatar: null, fullName: 'Owner', id: 'u-owner', username: 'owner' },
      { avatar: null, fullName: 'Admin', id: 'u-admin', username: 'admin' },
    ]);
    const state = await createCaller({ userId: 'u-admin' }).pendingOwnershipTransfer();
    expect(state?.transfer.id).toBe('tr-1');
    expect(state?.toUser).toMatchObject({ fullName: 'Admin' });
  });
});
