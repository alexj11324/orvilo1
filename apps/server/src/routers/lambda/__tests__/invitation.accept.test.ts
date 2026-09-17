// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invitationRouter } from '@/business/server/lambda-routers/invitation';

const {
  memberModel,
  projectMemberModel,
  queries,
  audit,
  invitationModel,
  invitationQueries,
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
    listInvitationProjectGrants: vi.fn(),
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

vi.mock('@/business/server/workspaceInvitation/queries', () => invitationQueries);

vi.mock('@/business/server/workspaceInvitation/email', () => ({
  buildInvitationUrl: (token: string) => `https://app.test/invite/${token}`,
  // Same masking rule as the real helper — keeps the preview assertion honest.
  maskEmail: (email: string | null | undefined) => {
    if (!email) return '***';
    const at = email.indexOf('@');
    if (at <= 0) return '***';
    return `${email[0]}***@${email.slice(at + 1)}`;
  },
  sendInvitationEmail: vi.fn(async () => true),
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

vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
}));

const fakeDb: any = {};
fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));

const futureDate = () => new Date(Date.now() + 3_600_000);

const baseInvitation = () => ({
  acceptedAt: null,
  acceptedBy: null,
  createdAt: new Date('2026-01-01'),
  createdByPolicyVersion: null,
  email: 'Invitee@X.com',
  emailNormalized: 'invitee@x.com',
  expiresAt: futureDate(),
  generation: 1,
  id: 'inv-1',
  inviterId: 'u-inviter',
  lastSentAt: new Date('2026-01-01'),
  revokedAt: null,
  revokedBy: null,
  role: 'member',
  status: 'pending',
  token: null,
  tokenHash: 'hash',
  updatedAt: new Date('2026-01-01'),
  workspaceId: 'ws-1',
});

const verifiedAccount = () => ({
  email: 'invitee@x.com',
  emailVerified: true,
  emailVerifiedAt: new Date('2026-01-02'),
  id: 'u-invitee',
  normalizedEmail: 'invitee@x.com',
});

const ownerMembership = { role: 'owner', suspendedAt: null, deletedAt: null };

const createCaller = (userId = 'u-invitee') =>
  invitationRouter.createCaller({ clientIp: '10.0.0.1', serverDB: fakeDb, userId } as any);

describe('invitationRouter.accept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));

    const invitation = baseInvitation();
    invitationModel.findByToken.mockResolvedValue(invitation);
    invitationModel.lockForUpdate.mockResolvedValue(invitation);
    invitationModel.markAccepted.mockResolvedValue(true);

    queries.lockWorkspaceForUpdate.mockResolvedValue({ id: 'ws-1' });
    queries.findUserById.mockImplementation(async (_db: any, userId: string) =>
      userId === 'u-invitee'
        ? verifiedAccount()
        : { avatar: null, fullName: 'Owner', id: userId, username: 'owner' },
    );
    queries.lockMembershipForUpdate.mockResolvedValue(undefined);
    queries.findUsersByNormalizedEmail.mockResolvedValue([]);

    memberModel.getMember.mockResolvedValue(ownerMembership);
    memberModel.addMember.mockResolvedValue({ role: 'member', userId: 'u-invitee' });
    projectMemberModel.getRole.mockResolvedValue(null);
    projectMemberModel.add.mockResolvedValue({});

    invitationQueries.listInvitationProjectGrants.mockResolvedValue([
      { invitationId: 'inv-1', projectId: 'proj-1', projectName: 'Alpha', role: 'contributor' },
    ]);
    workspaceModel.findById.mockResolvedValue({ avatar: null, id: 'ws-1', name: 'Team' });
  });

  it('joins the workspace, materializes project grants and consumes the token', async () => {
    const result = await createCaller().accept({ token: 'raw-token' });

    expect(result).toEqual({ alreadyMember: false, workspaceId: 'ws-1' });
    expect(memberModel.addMember).toHaveBeenCalledWith({
      role: 'member',
      userId: 'u-invitee',
      workspaceId: 'ws-1',
    });
    expect(projectMemberModel.add).toHaveBeenCalledWith({
      projectId: 'proj-1',
      role: 'contributor',
      userId: 'u-invitee',
      workspaceId: 'ws-1',
    });
    expect(invitationModel.markAccepted).toHaveBeenCalledWith('inv-1', {
      acceptedBy: 'u-invitee',
      generation: 1,
    });
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'invite.accepted', userId: 'u-invitee' }),
    );
    expect(audit.emitWorkspaceEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ eventType: 'workspace.invitation.accepted' }),
    );
  });

  it('rejects when the account email does not match the invitation', async () => {
    queries.findUserById.mockResolvedValue({
      ...verifiedAccount(),
      email: 'other@x.com',
      normalizedEmail: 'other@x.com',
    });

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(memberModel.addMember).not.toHaveBeenCalled();
    expect(invitationModel.markAccepted).not.toHaveBeenCalled();
  });

  it('rejects when the account email is not verified', async () => {
    queries.findUserById.mockResolvedValue({
      ...verifiedAccount(),
      emailVerified: false,
      emailVerifiedAt: null,
    });

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects an expired invitation', async () => {
    const expired = { ...baseInvitation(), expiresAt: new Date(Date.now() - 1000) };
    invitationModel.findByToken.mockResolvedValue(expired);
    invitationModel.lockForUpdate.mockResolvedValue(expired);

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('expired'),
    });
  });

  it('rejects a revoked invitation', async () => {
    invitationModel.findByToken.mockResolvedValue({ ...baseInvitation(), status: 'revoked' });

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('returns NOT_FOUND for an unknown or rotated-out token', async () => {
    invitationModel.findByToken.mockResolvedValue(undefined);

    await expect(createCaller().accept({ token: 'old-token' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns CONFLICT when the token was already consumed by somebody else', async () => {
    invitationModel.findByToken.mockResolvedValue({
      ...baseInvitation(),
      acceptedBy: 'u-someone-else',
      status: 'accepted',
    });

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('is idempotent for an active member: role and grants are untouched', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue({
      deletedAt: null,
      role: 'admin',
      suspendedAt: null,
      userId: 'u-invitee',
    });

    const result = await createCaller().accept({ token: 'raw-token' });

    expect(result).toEqual({ alreadyMember: true, workspaceId: 'ws-1' });
    expect(memberModel.addMember).not.toHaveBeenCalled();
    expect(projectMemberModel.add).not.toHaveBeenCalled();
    // The invitation is still consumed so the link cannot be replayed.
    expect(invitationModel.markAccepted).toHaveBeenCalled();
  });

  it('re-joins a removed member with only the new invitation scope', async () => {
    queries.lockMembershipForUpdate.mockResolvedValue({
      deletedAt: new Date('2026-02-01'),
      role: 'admin', // old role must not be resurrected
      suspendedAt: null,
      userId: 'u-invitee',
    });
    // They still hold a leftover row in proj-1 (e.g. never cleaned) — keep it.
    projectMemberModel.getRole.mockResolvedValue('viewer');

    const result = await createCaller().accept({ token: 'raw-token' });

    expect(result).toEqual({ alreadyMember: false, workspaceId: 'ws-1' });
    expect(memberModel.addMember).toHaveBeenCalledWith({
      role: 'member', // invitation role, not the old 'admin'
      userId: 'u-invitee',
      workspaceId: 'ws-1',
    });
    // Existing project membership is never overwritten by the invite grant.
    expect(projectMemberModel.add).not.toHaveBeenCalled();
  });

  it('rejects when the inviter is no longer an active member', async () => {
    memberModel.getMember.mockResolvedValue(undefined);

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(memberModel.addMember).not.toHaveBeenCalled();
  });

  it('rejects when the inviter can no longer grant the invitation role', async () => {
    // Inviter was demoted to plain member between invite and accept.
    memberModel.getMember.mockResolvedValue({ ...ownerMembership, role: 'member' });

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects an admin invitation issued by a non-owner who lost owner rights', async () => {
    const adminInvite = { ...baseInvitation(), role: 'admin' };
    invitationModel.findByToken.mockResolvedValue(adminInvite);
    invitationModel.lockForUpdate.mockResolvedValue(adminInvite);
    memberModel.getMember.mockResolvedValue({ ...ownerMembership, role: 'admin' });

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns CONFLICT when the conditional consume loses the race', async () => {
    invitationModel.markAccepted.mockResolvedValue(false);

    await expect(createCaller().accept({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

describe('invitationRouter.preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const invitation = baseInvitation();
    invitationModel.findByToken.mockResolvedValue(invitation);
    workspaceModel.findById.mockResolvedValue({ avatar: null, id: 'ws-1', name: 'Team' });
    queries.findUserById.mockResolvedValue({
      avatar: 'a.png',
      fullName: 'Owner One',
      id: 'u-inviter',
      username: 'owner',
    });
    invitationQueries.listInvitationProjectGrants.mockResolvedValue([
      { invitationId: 'inv-1', projectId: 'proj-1', projectName: 'Alpha', role: 'contributor' },
    ]);
  });

  it('returns masked contact hints and never exposes the raw token', async () => {
    const preview = await createCaller().preview({ token: 'raw-token' });

    expect(preview.status).toBe('pending');
    expect(preview.emailHint).toBe('i***@x.com');
    expect(preview.workspace).toEqual({ avatar: null, id: 'ws-1', name: 'Team' });
    expect(preview.projects).toEqual([{ id: 'proj-1', name: 'Alpha', role: 'contributor' }]);
    expect(preview.acceptedByCurrentUser).toBe(false);
    expect(JSON.stringify(preview)).not.toContain('raw-token');
  });

  it('surfaces the revoked status instead of a hard error', async () => {
    invitationModel.findByToken.mockResolvedValue({ ...baseInvitation(), status: 'revoked' });

    const preview = await createCaller().preview({ token: 'raw-token' });
    expect(preview.status).toBe('revoked');
  });

  it('surfaces the accepted status and who accepted', async () => {
    invitationModel.findByToken.mockResolvedValue({
      ...baseInvitation(),
      acceptedBy: 'u-invitee',
      status: 'accepted',
    });

    const preview = await createCaller().preview({ token: 'raw-token' });
    expect(preview.status).toBe('accepted');
    expect(preview.acceptedByCurrentUser).toBe(true);
  });

  it('rejects expired invitations', async () => {
    invitationModel.findByToken.mockResolvedValue({
      ...baseInvitation(),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(createCaller().preview({ token: 'raw-token' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('returns NOT_FOUND for unknown tokens', async () => {
    invitationModel.findByToken.mockResolvedValue(undefined);
    await expect(createCaller().preview({ token: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('invitationRouter.resend / revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));
    const invitation = baseInvitation();
    invitationModel.findById.mockResolvedValue(invitation);
    invitationModel.lockForUpdate.mockResolvedValue(invitation);
    invitationModel.rotateToken.mockResolvedValue('new-raw-token');
    invitationModel.revoke.mockResolvedValue(true);
    memberModel.getMember.mockResolvedValue({ role: 'admin', suspendedAt: null, deletedAt: null });
    workspaceModel.findById.mockResolvedValue({ avatar: null, id: 'ws-1', name: 'Team' });
    queries.findUserById.mockResolvedValue({ fullName: 'Admin', id: 'u-inviter' });
  });

  it('resend rotates the token and reports the new generation', async () => {
    invitationModel.lockForUpdate
      .mockResolvedValueOnce({ ...baseInvitation() })
      .mockResolvedValueOnce({ ...baseInvitation(), generation: 2 });

    const result = await createCaller('u-inviter').resend({ invitationId: 'inv-1' });

    expect(result).toMatchObject({ emailed: true, generation: 2, invitationId: 'inv-1' });
    expect(invitationModel.rotateToken).toHaveBeenCalledWith('inv-1');
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'invite.resent' }),
    );
  });

  it('resend rejects a non-pending invitation', async () => {
    invitationModel.lockForUpdate.mockResolvedValue({ ...baseInvitation(), status: 'accepted' });

    await expect(createCaller('u-inviter').resend({ invitationId: 'inv-1' })).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
  });

  it('resend requires admin membership on the invitation workspace', async () => {
    memberModel.getMember.mockResolvedValue({ role: 'member', suspendedAt: null, deletedAt: null });

    await expect(createCaller('u-inviter').resend({ invitationId: 'inv-1' })).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
  });

  it('revoke flips the pending invitation and emits audit + outbox', async () => {
    const result = await createCaller('u-inviter').revoke({ invitationId: 'inv-1' });

    expect(result).toEqual({ invitationId: 'inv-1', revoked: true });
    expect(invitationModel.revoke).toHaveBeenCalledWith('inv-1', { revokedBy: 'u-inviter' });
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'invite.revoked' }),
    );
    expect(audit.emitWorkspaceEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ eventType: 'workspace.invitation.revoked' }),
    );
  });

  it('revoke conflicts when the row is no longer pending', async () => {
    invitationModel.lockForUpdate.mockResolvedValue({ ...baseInvitation(), status: 'accepted' });

    await expect(createCaller('u-inviter').revoke({ invitationId: 'inv-1' })).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
  });
});
