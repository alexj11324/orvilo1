// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaceMemberRouter } from '@/business/server/lambda-routers/workspaceMember';

const {
  memberModel,
  projectMemberModel,
  queries,
  audit,
  invitationModel,
  invitationQueries,
  sendInvitationEmail,
  workspaceModel,
} = vi.hoisted(() => ({
  audit: {
    emitWorkspaceEvent: vi.fn(),
    recordAudit: vi.fn(),
  },
  invitationModel: {
    createInvitation: vi.fn(),
    findById: vi.fn(),
    findByToken: vi.fn(),
    listPendingByWorkspace: vi.fn(),
    lockForUpdate: vi.fn(),
    markAccepted: vi.fn(),
    revoke: vi.fn(),
    rotateToken: vi.fn(),
  },
  invitationQueries: {
    listInvitationProjectGrants: vi.fn().mockResolvedValue([]),
    listRecentTerminalInvitations: vi.fn(),
    markInvitationSent: vi.fn(),
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
  projectMemberModel: {
    add: vi.fn(),
    changeRole: vi.fn(),
    getRole: vi.fn(),
    listByProject: vi.fn(),
    listByUser: vi.fn(),
    remove: vi.fn(),
  },
  queries: {
    bumpAuthzVersion: vi.fn(),
    countActiveDelegations: vi.fn(),
    countMemberBoundDevices: vi.fn(),
    countOpenTasksAssignedTo: vi.fn(),
    countOpenTasksReviewedBy: vi.fn(),
    findMembershipRow: vi.fn(),
    findProjectsByIds: vi.fn(),
    findUserById: vi.fn(),
    findUsersByNormalizedEmail: vi.fn(),
    listMembersWithProfiles: vi.fn(),
    listOpenAssignedTaskTitles: vi.fn(),
    lockMembershipForUpdate: vi.fn(),
    lockWorkspaceForUpdate: vi.fn(),
    reassignOpenAssignedTasks: vi.fn(),
  },
  sendInvitationEmail: vi.fn(async () => true),
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
vi.mock('@/business/server/workspaceInvitation/queries', () => invitationQueries);
vi.mock('@/business/server/workspaceInvitation/email', () => ({
  buildInvitationUrl: (token: string) => `https://app.test/invite/${token}`,
  maskEmail: (email: string | null | undefined) => (email ? `m***@${email.split('@')[1]}` : '***'),
  sendInvitationEmail,
}));

vi.mock('@/database/models/workspaceInvitation', () => ({
  WorkspaceInvitationModel: Object.assign(
    vi.fn(function () {
      return invitationModel;
    }),
    { normalizeEmail: (email: string) => email.trim().toLowerCase() },
  ),
}));
vi.mock('@/database/models/workspaceMember', () => ({
  WorkspaceMemberModel: vi.fn(function () {
    return memberModel;
  }),
}));
vi.mock('@/database/models/projectMember', () => ({
  ProjectMemberModel: vi.fn(function () {
    return projectMemberModel;
  }),
}));
vi.mock('@/database/models/workspace', () => ({
  WorkspaceModel: vi.fn(function () {
    return workspaceModel;
  }),
}));
vi.mock('@/database/models/user', () => ({
  UserModel: { getDisplayInfoByIds: vi.fn(async () => []) },
}));

vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { authedProcedure } = await import('@/libs/trpc/lambda');
  const { trpc } = await import('@/libs/trpc/lambda/init');
  const pass = () =>
    trpc.middleware(async (opts: any) => opts.next({ ctx: opts.ctx }));
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

const createCaller = (
  role: 'admin' | 'member' | 'owner' | 'viewer' = 'admin',
  overrides: Record<string, unknown> = {},
) =>
  workspaceMemberRouter.createCaller({
    clientIp: '10.0.0.1',
    membership: { role, userId: `u-${role}`, workspaceId: 'ws-1' },
    serverDB: fakeDb,
    userId: `u-${role}`,
    workspaceId: 'ws-1',
    workspaceRole: role,
    ...overrides,
  } as any);

describe('workspaceMemberRouter.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.listMembersWithProfiles.mockResolvedValue([
      {
        member: { role: 'member', userId: 'u-1' },
        user: { avatar: null, email: 'one@x.com', fullName: 'One', id: 'u-1', username: 'one' },
      },
      { member: { role: 'viewer', userId: 'u-2' }, user: null },
    ]);
  });

  it('returns members with public profiles; emails only for admins', async () => {
    const asAdmin = await createCaller('admin').list();
    expect(asAdmin[0].user).toMatchObject({ email: 'one@x.com', fullName: 'One' });
    expect(asAdmin[1].user).toBeNull();

    const asMember = await createCaller('member').list();
    expect(asMember[0].user).toMatchObject({ email: null, fullName: 'One' });
  });

  it('reads as empty in personal mode', async () => {
    const rows = await createCaller('member', { workspaceId: undefined }).list();
    expect(rows).toEqual([]);
  });
});

describe('workspaceMemberRouter.invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));
    workspaceModel.findById.mockResolvedValue({ id: 'ws-1', name: 'Team' });
    queries.findUserById.mockResolvedValue({ email: 'admin@x.com', fullName: 'Admin' });
    queries.findUsersByNormalizedEmail.mockResolvedValue([]);
    queries.findProjectsByIds.mockResolvedValue([]);
    invitationModel.listPendingByWorkspace.mockResolvedValue([]);
    invitationModel.createInvitation.mockResolvedValue({
      invitation: { id: 'inv-new' },
      token: 'tok-1',
    });
    memberModel.getMember.mockResolvedValue(undefined);
  });

  it('creates one invitation per email, normalizes and emails the link', async () => {
    const { results } = await createCaller('admin').invite({
      emails: ['NewPerson@X.com'],
      role: 'member',
    });

    expect(results).toEqual([{ email: 'NewPerson@X.com', invitationId: 'inv-new', ok: true }]);
    expect(invitationModel.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ emailNormalized: 'newperson@x.com', role: 'member' }),
    );
    expect(sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'newperson@x.com', token: 'tok-1' }),
    );
    expect(invitationQueries.markInvitationSent).toHaveBeenCalled();
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'member.invited' }),
    );
  });

  it('keeps per-email failures isolated', async () => {
    const { results } = await createCaller('admin').invite({
      emails: ['not-an-email', 'good@x.com'],
      role: 'member',
    });

    expect(results[0]).toMatchObject({ error: 'invalid-email', ok: false });
    expect(results[1]).toMatchObject({ ok: true });
  });

  it('skips emails that already hold an active membership', async () => {
    queries.findUsersByNormalizedEmail.mockResolvedValue([{ id: 'u-existing' }]);
    memberModel.getMember.mockResolvedValue({ role: 'member' });

    const { results } = await createCaller('admin').invite({
      emails: ['existing@x.com'],
      role: 'member',
    });

    expect(results).toEqual([{ email: 'existing@x.com', error: 'already-member', ok: false }]);
    expect(invitationModel.createInvitation).not.toHaveBeenCalled();
  });

  it('skips emails with a still-pending invitation', async () => {
    invitationModel.listPendingByWorkspace.mockResolvedValue([
      { invitation: { emailNormalized: 'dup@x.com', id: 'inv-old' }, projectGrants: [] },
    ]);

    const { results } = await createCaller('admin').invite({
      emails: ['dup@x.com'],
      role: 'member',
    });

    expect(results).toEqual([{ email: 'dup@x.com', error: 'already-invited', ok: false }]);
  });

  it('forbids an admin from granting the admin role', async () => {
    await expect(
      createCaller('admin').invite({ emails: ['x@x.com'], role: 'admin' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(invitationModel.createInvitation).not.toHaveBeenCalled();
  });

  it('forbids members and viewers from inviting at all', async () => {
    await expect(
      createCaller('member').invite({ emails: ['x@x.com'], role: 'member' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      createCaller('viewer').invite({ emails: ['x@x.com'], role: 'viewer' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('attaches project grants capped to the invitee workspace role', async () => {
    queries.findProjectsByIds.mockResolvedValue([
      { id: 'proj-1', userId: 'u-admin', visibility: 'public', workspaceId: 'ws-1' },
    ]);

    await createCaller('owner').invite({
      emails: ['x@x.com'],
      projectIds: ['proj-1'],
      role: 'viewer',
    });

    expect(invitationModel.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectGrants: [{ projectId: 'proj-1', role: 'commenter' }],
      }),
    );
  });

  it('rejects project ids outside the workspace', async () => {
    queries.findProjectsByIds.mockResolvedValue([
      { id: 'proj-9', userId: 'u-admin', visibility: 'public', workspaceId: 'ws-elsewhere' },
    ]);

    await expect(
      createCaller('admin').invite({ emails: ['x@x.com'], projectIds: ['proj-9'], role: 'member' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('workspaceMemberRouter.changeRole / suspend / resume / remove / leave', () => {
  const memberRow = (overrides: Record<string, unknown> = {}) => ({
    authzVersion: 3,
    deletedAt: null,
    role: 'member',
    suspendedAt: null,
    userId: 'u-target',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));
    queries.lockWorkspaceForUpdate.mockResolvedValue({ id: 'ws-1' });
    queries.lockMembershipForUpdate.mockResolvedValue(memberRow());
    memberModel.updateMemberRole.mockResolvedValue([{ userId: 'u-target' }]);
    memberModel.suspendMember.mockResolvedValue([{ userId: 'u-target' }]);
    memberModel.resumeMember.mockResolvedValue([{ userId: 'u-target' }]);
    memberModel.removeMember.mockResolvedValue({ removedDeviceIds: ['dev-1'] });
    memberModel.getMember.mockResolvedValue({ role: 'member' });
    queries.reassignOpenAssignedTasks.mockResolvedValue(2);
  });

  it('changes a member role and bumps their authz version', async () => {
    const result = await createCaller('owner').changeRole({ role: 'admin', userId: 'u-target' });

    expect(result).toEqual({ changed: true, role: 'admin' });
    expect(memberModel.updateMemberRole).toHaveBeenCalledWith('ws-1', 'u-target', 'admin');
    expect(queries.bumpAuthzVersion).toHaveBeenCalledWith(fakeDb, 'ws-1', 'u-target');
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'member.role_updated' }),
    );
  });

  it('refuses to change your own role', async () => {
    await expect(
      createCaller('owner').changeRole({ role: 'member', userId: 'u-owner' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('protects the owner row from direct role edits', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue(memberRow({ role: 'owner' }));
    await expect(
      createCaller('owner').changeRole({ role: 'admin', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('blocks an admin from re-grading another admin', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue(memberRow({ role: 'admin' }));
    await expect(
      createCaller('admin').changeRole({ role: 'member', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('detects stale authz versions', async () => {
    await expect(
      createCaller('owner').changeRole({
        expectedAuthzVersion: 1,
        role: 'admin',
        userId: 'u-target',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('suspends and resumes a member with audit entries', async () => {
    const suspended = await createCaller('admin').suspend({ userId: 'u-target' });
    expect(suspended).toEqual({ changed: true, suspended: true });
    expect(memberModel.suspendMember).toHaveBeenCalledWith('ws-1', 'u-target');

    queries.lockMembershipForUpdate.mockResolvedValue(
      memberRow({ suspendedAt: new Date('2026-01-01') }),
    );
    const resumed = await createCaller('admin').resume({ userId: 'u-target' });
    expect(resumed).toEqual({ changed: true, suspended: false });
    expect(memberModel.resumeMember).toHaveBeenCalledWith('ws-1', 'u-target');
  });

  it('suspend is idempotent on an already-suspended member', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue(
      memberRow({ suspendedAt: new Date('2026-01-01') }),
    );
    const result = await createCaller('admin').suspend({ userId: 'u-target' });
    expect(result).toEqual({ changed: false, suspended: true });
    expect(memberModel.suspendMember).not.toHaveBeenCalled();
  });

  it('refuses to suspend the owner', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue(memberRow({ role: 'owner' }));
    await expect(createCaller('admin').suspend({ userId: 'u-target' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('removes a member, reassigning their open tasks', async () => {
    const result = await createCaller('admin').remove({
      reassignToUserId: 'u-admin',
      userId: 'u-target',
    });

    expect(result).toEqual({ reassignedTaskCount: 2, removedDeviceIds: ['dev-1'] });
    expect(queries.reassignOpenAssignedTasks).toHaveBeenCalledWith(fakeDb, {
      fromUserId: 'u-target',
      toUserId: 'u-admin',
      workspaceId: 'ws-1',
    });
    expect(memberModel.removeMember).toHaveBeenCalledWith('ws-1', 'u-target');
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'member.removed' }),
    );
  });

  it('refuses to remove the owner or yourself', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue(memberRow({ role: 'owner' }));
    await expect(createCaller('admin').remove({ userId: 'u-target' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    queries.lockMembershipForUpdate.mockResolvedValue(memberRow({ userId: 'u-admin' }));
    await expect(createCaller('admin').remove({ userId: 'u-admin' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('blocks an admin from removing another admin', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue(memberRow({ role: 'admin' }));
    await expect(createCaller('admin').remove({ userId: 'u-target' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lets a member leave but never the owner', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue(memberRow({ userId: 'u-member' }));
    const result = await createCaller('member').leave();
    expect(result).toEqual({ left: true });
    expect(memberModel.removeMember).toHaveBeenCalledWith('ws-1', 'u-member');

    queries.lockMembershipForUpdate.mockResolvedValue(
      memberRow({ role: 'owner', userId: 'u-owner' }),
    );
    await expect(createCaller('owner').leave()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('workspaceMemberRouter.listInvitations / removalPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invitationModel.listPendingByWorkspace.mockResolvedValue([
      {
        invitation: {
          createdAt: new Date('2026-01-01'),
          emailNormalized: 'new@x.com',
          expiresAt: new Date('2026-01-08'),
          generation: 1,
          id: 'inv-1',
          inviterId: 'u-admin',
          lastSentAt: null,
          role: 'member',
          status: 'pending',
        },
        projectGrants: [{ projectId: 'proj-1', role: 'contributor' }],
      },
    ]);
    invitationQueries.listRecentTerminalInvitations.mockResolvedValue([]);
    memberModel.getMember.mockResolvedValue({ role: 'member' });
    queries.findMembershipRow.mockResolvedValue({ deletedAt: null, role: 'member' });
    queries.countActiveDelegations.mockResolvedValue(1);
    queries.countMemberBoundDevices.mockResolvedValue(2);
    queries.countOpenTasksAssignedTo.mockResolvedValue(3);
    queries.countOpenTasksReviewedBy.mockResolvedValue(0);
    queries.listOpenAssignedTaskTitles.mockResolvedValue([{ id: 't-1', title: 'Task one' }]);
  });

  it('lists pending invitations with their project grants and no token material', async () => {
    const items = await createCaller('admin').listInvitations();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      email: 'new@x.com',
      generation: 1,
      projects: [{ projectId: 'proj-1', role: 'contributor' }],
      status: 'pending',
    });
    expect(JSON.stringify(items)).not.toContain('tokenHash');
  });

  it('previews what removal would orphan', async () => {
    const preview = await createCaller('admin').removalPreview({ userId: 'u-target' });
    expect(preview).toMatchObject({
      assignedTaskCount: 3,
      runningDelegationCount: 1,
      sharedDeviceCount: 2,
    });
  });
});
