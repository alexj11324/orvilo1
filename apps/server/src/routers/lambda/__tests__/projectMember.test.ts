// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectMemberRouter } from '@/business/server/lambda-routers/projectMember';

const { memberModel, projectMemberModel, queries, audit } = vi.hoisted(() => ({
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
}));

vi.mock('@/business/server/membershipLifecycle/audit', () => audit);
vi.mock('@/business/server/membershipLifecycle/queries', () => queries);

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
vi.mock('@/database/models/user', () => ({
  UserModel: { getDisplayInfoByIds: vi.fn(async () => []) },
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

const createCaller = (
  role: 'admin' | 'member' | 'owner' | 'viewer' = 'admin',
  overrides: Record<string, unknown> = {},
) =>
  projectMemberRouter.createCaller({
    clientIp: '10.0.0.1',
    serverDB: fakeDb,
    userId: `u-${role}`,
    workspaceId: 'ws-1',
    workspaceRole: role,
    ...overrides,
  } as any);

const workspaceProject = {
  id: 'proj-1',
  userId: 'u-owner',
  visibility: 'public',
  workspaceId: 'ws-1',
};

const activeTarget = (role = 'member') => ({
  deletedAt: null,
  role,
  suspendedAt: null,
  userId: 'u-target',
});

describe('projectMemberRouter.add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));
    queries.findProjectsByIds.mockResolvedValue([workspaceProject]);
    // Caller holds 'manager' on the project — enough for a plain member.
    projectMemberModel.getRole.mockResolvedValue('manager');
    projectMemberModel.add.mockResolvedValue({});
    memberModel.getMember.mockResolvedValue(activeTarget());
  });

  it('lets a project manager add a workspace member', async () => {
    const result = await createCaller('member').add({
      projectId: 'proj-1',
      role: 'contributor',
      userId: 'u-target',
    });

    expect(result).toEqual({ added: true, role: 'contributor' });
    expect(projectMemberModel.add).toHaveBeenCalledWith({
      projectId: 'proj-1',
      role: 'contributor',
      userId: 'u-target',
      workspaceId: 'ws-1',
    });
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'project_member.added' }),
    );
    expect(audit.emitWorkspaceEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ eventType: 'project_member.added' }),
    );
  });

  it('lets a workspace admin add regardless of project role', async () => {
    projectMemberModel.getRole.mockResolvedValue(null);
    const result = await createCaller('admin').add({
      projectId: 'proj-1',
      role: 'manager',
      userId: 'u-target',
    });
    expect(result).toEqual({ added: true, role: 'manager' });
  });

  it('caps the granted role at commenter for workspace viewers', async () => {
    memberModel.getMember.mockResolvedValue(activeTarget('viewer'));

    const result = await createCaller('admin').add({
      projectId: 'proj-1',
      role: 'manager',
      userId: 'u-target',
    });

    expect(result).toEqual({ added: true, role: 'commenter' });
    expect(projectMemberModel.add).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'commenter' }),
    );
  });

  it('denies a plain member who is not the project manager', async () => {
    projectMemberModel.getRole.mockResolvedValue('contributor');

    await expect(
      createCaller('member').add({ projectId: 'proj-1', role: 'viewer', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(projectMemberModel.add).not.toHaveBeenCalled();
  });

  it('denies a workspace viewer even with a project manager row', async () => {
    projectMemberModel.getRole.mockResolvedValue('manager');

    await expect(
      createCaller('viewer').add({ projectId: 'proj-1', role: 'viewer', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects targets that are not active workspace members', async () => {
    memberModel.getMember.mockResolvedValue(undefined);

    await expect(
      createCaller('admin').add({ projectId: 'proj-1', role: 'viewer', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects suspended workspace members as targets', async () => {
    memberModel.getMember.mockResolvedValue({ ...activeTarget(), suspendedAt: new Date() });

    await expect(
      createCaller('admin').add({ projectId: 'proj-1', role: 'viewer', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('hides projects outside the workspace', async () => {
    queries.findProjectsByIds.mockResolvedValue([{ ...workspaceProject, workspaceId: 'ws-2' }]);

    await expect(
      createCaller('admin').add({ projectId: 'proj-1', role: 'viewer', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('projectMemberRouter.changeRole / remove / list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb.transaction = vi.fn(async (cb: any) => cb(fakeDb));
    queries.findProjectsByIds.mockResolvedValue([workspaceProject]);
    projectMemberModel.getRole.mockResolvedValue('manager');
    projectMemberModel.changeRole.mockResolvedValue([{}]);
    projectMemberModel.remove.mockResolvedValue([{}]);
    projectMemberModel.listByProject.mockResolvedValue([
      { role: 'manager', userId: 'u-1' },
      { role: 'viewer', userId: 'u-2' },
    ]);
    memberModel.getMember.mockResolvedValue(activeTarget());
  });

  it('re-grades a member and records the audit event', async () => {
    const result = await createCaller('member').changeRole({
      projectId: 'proj-1',
      role: 'viewer',
      userId: 'u-target',
    });

    expect(result).toEqual({ changed: true, role: 'viewer' });
    expect(projectMemberModel.changeRole).toHaveBeenCalledWith('proj-1', 'u-target', 'viewer');
  });

  it('caps role changes for workspace viewers at commenter', async () => {
    memberModel.getMember.mockResolvedValue(activeTarget('viewer'));

    const result = await createCaller('admin').changeRole({
      projectId: 'proj-1',
      role: 'contributor',
      userId: 'u-target',
    });

    expect(result).toEqual({ changed: true, role: 'commenter' });
  });

  it('removes a member via the soft-delete model write', async () => {
    const result = await createCaller('admin').remove({ projectId: 'proj-1', userId: 'u-target' });

    expect(result).toEqual({ removed: true });
    expect(projectMemberModel.remove).toHaveBeenCalledWith('proj-1', 'u-target');
    expect(audit.recordAudit).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: 'project_member.removed' }),
    );
  });

  it('requires manage rights to remove', async () => {
    projectMemberModel.getRole.mockResolvedValue(null);

    await expect(
      createCaller('member').remove({ projectId: 'proj-1', userId: 'u-target' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists members with their public profile and project role', async () => {
    const rows = await createCaller('member').list({ projectId: 'proj-1' });

    expect(projectMemberModel.listByProject).toHaveBeenCalledWith('proj-1');
    expect(rows).toEqual([
      { projectId: 'proj-1', role: 'manager', user: null, userId: 'u-1' },
      { projectId: 'proj-1', role: 'viewer', user: null, userId: 'u-2' },
    ]);
  });

  it('hides a private project roster from a workspace member with no grant', async () => {
    queries.findProjectsByIds.mockResolvedValue([{ ...workspaceProject, visibility: 'private' }]);
    projectMemberModel.getRole.mockResolvedValue(null);

    await expect(createCaller('member').list({ projectId: 'proj-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(projectMemberModel.listByProject).not.toHaveBeenCalled();
  });

  it('lets a granted project member list a private roster', async () => {
    queries.findProjectsByIds.mockResolvedValue([{ ...workspaceProject, visibility: 'private' }]);
    projectMemberModel.getRole.mockResolvedValue('viewer');

    const rows = await createCaller('member').list({ projectId: 'proj-1' });
    expect(rows).toHaveLength(2);
  });

  it('hides a private roster even from a workspace admin without a grant', async () => {
    queries.findProjectsByIds.mockResolvedValue([{ ...workspaceProject, visibility: 'private' }]);
    projectMemberModel.getRole.mockResolvedValue(null);

    await expect(createCaller('admin').list({ projectId: 'proj-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('lets the creator list a private roster without a member row', async () => {
    queries.findProjectsByIds.mockResolvedValue([
      { ...workspaceProject, userId: 'u-member', visibility: 'private' },
    ]);
    projectMemberModel.getRole.mockResolvedValue(null);

    const rows = await createCaller('member').list({ projectId: 'proj-1' });
    expect(rows).toHaveLength(2);
  });
});
