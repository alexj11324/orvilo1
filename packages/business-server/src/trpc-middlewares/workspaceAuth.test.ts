// @vitest-environment node
import type { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { publicProcedure, router } from '@/libs/trpc/lambda';

import {
  cloudWorkspaceAuth,
  requireWorkspaceRole,
  requireWorkspaceRoleWhenScoped,
  wsAdminProcedure,
  wsCompatProcedure,
  wsMemberProcedure,
  wsOwnerProcedure,
  wsProcedure,
} from './workspaceAuth';

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
 * Minimal drizzle-select chain for the global-grant probe in
 * `fetchDbGrantedCodes` (`select → from → innerJoin × 3 → where`).
 * `mockWhere` resolves the rows — non-empty means the caller holds an
 * active global DB grant.
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
  compatContext: wsCompatProcedure.query(({ ctx }) => ({
    membership: ctx.membership,
    workspaceId: ctx.workspaceId,
    workspaceRole: ctx.workspaceRole,
    workspaceSlug: ctx.workspaceSlug,
  })),
  compatAdminContext: wsCompatProcedure.use(requireWorkspaceRole('admin')).query(({ ctx }) => ({
    membership: ctx.membership,
    workspaceRole: ctx.workspaceRole,
  })),
  compatWhenScopedAdmin: wsCompatProcedure
    .use(requireWorkspaceRoleWhenScoped('admin'))
    .query(({ ctx }) => ({ workspaceRole: ctx.workspaceRole })),
  memberContext: wsMemberProcedure.query(({ ctx }) => ({
    membership: ctx.membership,
    workspaceRole: ctx.workspaceRole,
  })),
  adminContext: wsAdminProcedure.query(({ ctx }) => ({ workspaceRole: ctx.workspaceRole })),
  ownerContext: wsOwnerProcedure.query(({ ctx }) => ({ workspaceRole: ctx.workspaceRole })),
  wsContext: wsProcedure.query(({ ctx }) => ({ workspaceRole: ctx.workspaceRole })),
  // A public chain carrying the middleware, like `message.getMessages` /
  // `market.creds` — the membership check must hold without `authedProcedure`.
  publicCompatContext: publicProcedure
    .use(cloudWorkspaceAuth)
    .query(({ ctx }) => ({ workspaceId: ctx.workspaceId, workspaceRole: ctx.workspaceRole })),
});

const authedCaller = (ctx: { userId?: string | null; workspaceId?: string | null }) =>
  testRouter.createCaller(ctx as never);

const expectTrpcError = async (promise: Promise<unknown>, code: TRPCError['code']) => {
  await expect(promise).rejects.toMatchObject({ code });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerDB.mockResolvedValue(makeDb());
  mockWhere.mockResolvedValue([]);
  mockGetActiveWorkspaceMembershipRole.mockResolvedValue('member');
});

describe('wsCompatProcedure', () => {
  it('passes through in personal mode when no workspace is selected', async () => {
    const caller = authedCaller({ userId: 'user-1' });

    await expect(caller.compatContext()).resolves.toEqual({
      membership: null,
      workspaceId: undefined,
      workspaceRole: undefined,
      workspaceSlug: undefined,
    });
    expect(mockGetActiveWorkspaceMembershipRole).not.toHaveBeenCalled();
  });

  it('does not synthesize a workspace slug', async () => {
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expect(caller.compatContext()).resolves.toMatchObject({
      workspaceId: 'ws-1',
      workspaceSlug: undefined,
    });
  });

  it('attaches the verified membership and role for an active member', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('admin');
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expect(caller.compatContext()).resolves.toEqual({
      membership: { role: 'admin', userId: 'user-1', workspaceId: 'ws-1' },
      workspaceId: 'ws-1',
      workspaceRole: 'admin',
      workspaceSlug: undefined,
    });
  });

  it('rejects a non-member instead of downgrading to personal', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.compatContext(), 'FORBIDDEN');
  });

  it('rejects a wrong-tenant workspace id identically (no existence leak)', async () => {
    // Unknown workspace and non-member resolve the same `null` from the
    // helper, so probing cannot distinguish them.
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-other-tenant' });

    await expectTrpcError(caller.compatContext(), 'FORBIDDEN');
  });

  it('rejects suspended and removed members (helper reports null)', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.compatContext(), 'FORBIDDEN');
  });

  it('lets a non-member holding an active global grant through without membership', async () => {
    // e.g. super_admin granted via rbac_user_roles with workspace_id IS NULL —
    // globally-granted roles legitimately apply inside any workspace, so the
    // request continues with `membership: null` and no `workspaceRole`.
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    mockWhere.mockResolvedValueOnce([{ code: 'rbac:role_read:all' }]);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expect(caller.compatContext()).resolves.toEqual({
      membership: null,
      workspaceId: 'ws-1',
      workspaceRole: undefined,
      workspaceSlug: undefined,
    });
  });

  it('still rejects a non-member who holds no global grant', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    mockWhere.mockResolvedValueOnce([]); // the grant probe finds nothing
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.compatContext(), 'FORBIDDEN');
  });

  it('rejects an unauthenticated caller addressing a workspace on a public chain', async () => {
    const caller = testRouter.createCaller({ workspaceId: 'ws-1' } as never);

    await expectTrpcError(caller.publicCompatContext(), 'FORBIDDEN');
    expect(mockGetActiveWorkspaceMembershipRole).not.toHaveBeenCalled();
  });

  it('lets an unauthenticated caller through in personal mode on a public chain', async () => {
    const caller = testRouter.createCaller({} as never);

    await expect(caller.publicCompatContext()).resolves.toEqual({
      workspaceId: undefined,
      workspaceRole: undefined,
    });
  });
});

describe('wsMemberProcedure / wsProcedure', () => {
  it('requires a workspace id', async () => {
    const caller = authedCaller({ userId: 'user-1' });

    await expectTrpcError(caller.memberContext(), 'BAD_REQUEST');
    await expectTrpcError(caller.wsContext(), 'BAD_REQUEST');
  });

  it('requires authentication', async () => {
    const caller = testRouter.createCaller({ workspaceId: 'ws-1' } as never);

    await expectTrpcError(caller.memberContext(), 'UNAUTHORIZED');
  });

  it('rejects non-members', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.memberContext(), 'FORBIDDEN');
  });

  it('attaches membership and role for active members including viewers', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('viewer');
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expect(caller.memberContext()).resolves.toEqual({
      membership: { role: 'viewer', userId: 'user-1', workspaceId: 'ws-1' },
      workspaceRole: 'viewer',
    });
  });
});

describe('wsAdminProcedure', () => {
  it.each(['admin', 'owner'])('allows role %s', async (role) => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(role);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expect(caller.adminContext()).resolves.toEqual({ workspaceRole: role });
  });

  it.each(['member', 'viewer'])('rejects role %s', async (role) => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(role);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.adminContext(), 'FORBIDDEN');
  });
});

describe('wsOwnerProcedure', () => {
  it('allows the owner', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('owner');
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expect(caller.ownerContext()).resolves.toEqual({ workspaceRole: 'owner' });
  });

  it.each(['admin', 'member', 'viewer'])('rejects role %s', async (role) => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(role);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.ownerContext(), 'FORBIDDEN');
  });
});

describe('requireWorkspaceRole / requireWorkspaceRoleWhenScoped', () => {
  it('enforces the role when a workspace is in scope', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('member');
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.compatAdminContext(), 'FORBIDDEN');
    await expectTrpcError(caller.compatWhenScopedAdmin(), 'FORBIDDEN');
  });

  it('passes in personal mode (implicit owner of the personal space)', async () => {
    const caller = authedCaller({ userId: 'user-1' });

    await expect(caller.compatAdminContext()).resolves.toEqual({
      membership: null,
      workspaceRole: undefined,
    });
    await expect(caller.compatWhenScopedAdmin()).resolves.toEqual({ workspaceRole: undefined });
  });

  it('rejects non-members even for the lowest role gate', async () => {
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce(null);
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });

    await expectTrpcError(caller.compatAdminContext(), 'FORBIDDEN');
  });

  it('resolves membership once when workspace middlewares compose', async () => {
    const caller = authedCaller({ userId: 'user-1', workspaceId: 'ws-1' });
    mockGetActiveWorkspaceMembershipRole.mockResolvedValueOnce('admin');

    await expect(caller.compatAdminContext()).resolves.toEqual({
      membership: { role: 'admin', userId: 'user-1', workspaceId: 'ws-1' },
      workspaceRole: 'admin',
    });
    expect(mockGetActiveWorkspaceMembershipRole).toHaveBeenCalledTimes(1);
  });
});
