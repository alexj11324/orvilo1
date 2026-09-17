// @vitest-environment node
import type { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authedProcedure, router } from '@/libs/trpc/lambda';

import {
  withAllRbacPermissions,
  withAnyRbacPermission,
  withRbacPermission,
  withScopedPermission,
} from './rbacPermission';
import { wsCompatProcedure } from './workspaceAuth';

const { mockGetActiveWorkspaceMembershipRole, mockGetServerDB, mockWhere } = vi.hoisted(() => ({
  mockGetActiveWorkspaceMembershipRole: vi.fn(),
  mockGetServerDB: vi.fn(),
  mockWhere: vi.fn(),
}));

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: mockGetServerDB,
}));

vi.mock('@/database/models/workspace', () => ({
  getActiveWorkspaceMembershipRole: mockGetActiveWorkspaceMembershipRole,
}));

/**
 * Minimal drizzle-select chain for the DB-role fallback query
 * (`select → from → innerJoin × 3 → where`). `mockWhere` resolves the rows.
 */
const makeDb = () => ({
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: mockWhere,
          }),
        }),
      }),
    }),
  }),
});

const testRouter = router({
  compatScopedAgentUpdate: wsCompatProcedure
    .use(withScopedPermission('agent:update'))
    .query(({ ctx }) => ({ workspaceRole: ctx.workspaceRole })),
  rbacDeleteAll: authedProcedure
    .use(withRbacPermission('workspace:delete:all'))
    .query(() => 'ok'),
  rbacReadAll: authedProcedure.use(withRbacPermission('agent:read:all')).query(() => 'ok'),
  rbacUpdateAll: authedProcedure
    .use(withRbacPermission('workspace:update:all'))
    .query(() => 'ok'),
  rbacRoleRead: authedProcedure
    .use(withRbacPermission('rbac:role_read:all'))
    .query(() => 'ok'),
  scopedAgentUpdate: authedProcedure
    .use(withScopedPermission('agent:update'))
    .query(({ ctx }) => ({ workspaceRole: ctx.workspaceRole })),
  scopedSessionGroupCreate: authedProcedure
    .use(withScopedPermission('session_group:create'))
    .query(() => 'ok'),
  scopedWorkspaceSettings: authedProcedure
    .use(withScopedPermission('workspace:settings_update'))
    .query(() => 'ok'),
  anyAgentWrite: authedProcedure
    .use(withAnyRbacPermission(['agent:update:owner', 'agent:update:all']))
    .query(() => 'ok'),
  anyEmpty: authedProcedure.use(withAnyRbacPermission([])).query(() => 'ok'),
  allAgentWrite: authedProcedure
    .use(withAllRbacPermissions(['agent:update:owner', 'agent:delete:owner']))
    .query(() => 'ok'),
  allEmpty: authedProcedure.use(withAllRbacPermissions([])).query(() => 'ok'),
  allMixed: authedProcedure
    .use(withAllRbacPermissions(['agent:update:owner', 'workspace:delete:all']))
    .query(() => 'ok'),
});

const caller = (ctx: { userId?: string | null; workspaceId?: string | null }) =>
  testRouter.createCaller({ userId: 'user-1', ...ctx } as never);

const expectTrpcError = async (promise: Promise<unknown>, code: TRPCError['code']) => {
  await expect(promise).rejects.toMatchObject({ code });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerDB.mockResolvedValue(makeDb());
  mockWhere.mockResolvedValue([]);
  mockGetActiveWorkspaceMembershipRole.mockResolvedValue('member');
});

describe('personal mode (no workspace selected)', () => {
  it('grants the implicit-owner baseline over own content', async () => {
    const c = caller({});

    await expect(c.scopedAgentUpdate()).resolves.toEqual({ workspaceRole: undefined });
    await expect(c.anyAgentWrite()).resolves.toBe('ok');
    // `:all`-scoped codes are NOT part of the personal baseline — widening
    // past own content still requires a real DB role.
    await expectTrpcError(c.rbacReadAll(), 'FORBIDDEN');
  });

  it('grants workspace-domain codes so personal flows keep working', async () => {
    // Personal export/credentials/settings are gated on workspace:* codes —
    // the caller owns their personal space.
    const c = caller({});

    await expect(c.rbacDeleteAll()).resolves.toBe('ok');
    await expect(c.rbacUpdateAll()).resolves.toBe('ok');
    await expect(c.scopedWorkspaceSettings()).resolves.toBe('ok');
  });

  it('still withholds system administration codes', async () => {
    const c = caller({});

    await expectTrpcError(c.rbacRoleRead(), 'FORBIDDEN');
  });
});

describe('workspace mode — role matrix', () => {
  it('member: content writes pass, workspace administration fails', async () => {
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.scopedAgentUpdate()).resolves.toEqual({ workspaceRole: 'member' });
    await expect(c.scopedSessionGroupCreate()).resolves.toBe('ok');
    await expect(c.anyAgentWrite()).resolves.toBe('ok');
    await expect(c.allAgentWrite()).resolves.toBe('ok');
    await expectTrpcError(c.rbacDeleteAll(), 'FORBIDDEN');
    await expectTrpcError(c.rbacUpdateAll(), 'FORBIDDEN');
    await expectTrpcError(c.scopedWorkspaceSettings(), 'FORBIDDEN');
    await expectTrpcError(c.allMixed(), 'FORBIDDEN');
  });

  it('viewer: strict read-only — every write gate fails', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValue('viewer');
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.rbacReadAll()).resolves.toBe('ok');
    await expectTrpcError(c.scopedAgentUpdate(), 'FORBIDDEN');
    await expectTrpcError(c.anyAgentWrite(), 'FORBIDDEN');
    await expectTrpcError(c.allAgentWrite(), 'FORBIDDEN');
    await expectTrpcError(c.scopedWorkspaceSettings(), 'FORBIDDEN');
  });

  it('admin: workspace administration without owner-only codes', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValue('admin');
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.rbacUpdateAll()).resolves.toBe('ok');
    await expect(c.scopedWorkspaceSettings()).resolves.toBe('ok');
    await expect(c.scopedAgentUpdate()).resolves.toEqual({ workspaceRole: 'admin' });
    // workspace:delete:all stays owner-only.
    await expectTrpcError(c.rbacDeleteAll(), 'FORBIDDEN');
  });

  it('owner: every gate passes', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValue('owner');
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.rbacDeleteAll()).resolves.toBe('ok');
    await expect(c.scopedWorkspaceSettings()).resolves.toBe('ok');
    await expect(c.scopedAgentUpdate()).resolves.toEqual({ workspaceRole: 'owner' });
  });
});

describe('workspace mode — membership enforcement', () => {
  it('rejects non-members instead of downgrading to personal grants', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const c = caller({ workspaceId: 'ws-1' });

    await expectTrpcError(c.scopedAgentUpdate(), 'FORBIDDEN');
  });

  it('rejects suspended and removed members identically (helper reports null)', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const c = caller({ workspaceId: 'ws-1' });

    await expectTrpcError(c.anyAgentWrite(), 'FORBIDDEN');
  });

  it('rejects a wrong-tenant workspace id', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const c = caller({ workspaceId: 'ws-other-tenant' });

    await expectTrpcError(c.scopedAgentUpdate(), 'FORBIDDEN');
  });
});

describe('operator semantics', () => {
  it('withAnyRbacPermission denies an empty code list', async () => {
    await expectTrpcError(caller({}).anyEmpty(), 'FORBIDDEN');
  });

  it('withAllRbacPermissions allows an empty code list', async () => {
    await expect(caller({}).allEmpty()).resolves.toBe('ok');
  });
});

describe('DB-granted role fallback', () => {
  it('lets a globally-granted role satisfy a matrix miss', async () => {
    // e.g. super_admin-style DB grant: the member matrix lacks
    // workspace:delete:all, but an active global role provides it.
    mockWhere.mockResolvedValueOnce([{ code: 'workspace:delete:all' }]);
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.rbacDeleteAll()).resolves.toBe('ok');
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it('does not hit the DB when the matrix already grants the code', async () => {
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.scopedAgentUpdate()).resolves.toEqual({ workspaceRole: 'member' });
    expect(mockWhere).not.toHaveBeenCalled();
  });
});

describe('middleware composition', () => {
  it('reuses the membership resolved by the workspace-auth middleware once', async () => {
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.compatScopedAgentUpdate()).resolves.toEqual({ workspaceRole: 'member' });
    expect(mockGetActiveWorkspaceMembershipRole).toHaveBeenCalledTimes(1);
  });

  it('attaches workspaceRole for row-level ownership helpers', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('admin');
    const c = caller({ workspaceId: 'ws-1' });

    await expect(c.scopedAgentUpdate()).resolves.toEqual({ workspaceRole: 'admin' });
  });
});
