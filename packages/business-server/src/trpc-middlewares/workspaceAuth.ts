import { TRPCError } from '@trpc/server';

import { getServerDB } from '@/database/core/db-adaptor';
import { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
import { authedProcedure } from '@/libs/trpc/lambda';
import { trpc } from '@/libs/trpc/lambda/init';

export type WorkspaceRole = 'admin' | 'member' | 'owner' | 'viewer';

const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['admin', 'member', 'owner', 'viewer'];

/**
 * Built-in workspace roles ordered lowest → highest. `workspace_members.role`
 * is the single source of truth, so this ordering is the whole hierarchy.
 */
const WORKSPACE_ROLE_ORDER: readonly WorkspaceRole[] = ['viewer', 'member', 'admin', 'owner'];

const hasMinWorkspaceRole = (role: WorkspaceRole, minRole: WorkspaceRole) =>
  WORKSPACE_ROLE_ORDER.indexOf(role) >= WORKSPACE_ROLE_ORDER.indexOf(minRole);

/**
 * The caller's verified workspace membership, attached to `ctx` by the
 * workspace-auth middlewares. `workspaceId` is carried alongside so composed
 * middlewares only reuse a membership resolved for the request's current
 * workspace selector — a stale value can never be trusted.
 */
export interface WorkspaceMembership {
  role: WorkspaceRole;
  userId: string;
  workspaceId: string;
}

/**
 * Structural view of the tRPC context for membership resolution. All fields
 * are optional: `membership` only exists once a workspace-auth middleware has
 * run, and `userId` is absent for unauthenticated requests on public chains.
 */
export interface MembershipContext {
  membership?: WorkspaceMembership | null;
  userId?: string | null;
  workspaceId?: string | null;
}

const asWorkspaceRole = (role: string | null | undefined): WorkspaceRole | null =>
  WORKSPACE_ROLES.includes(role as WorkspaceRole) ? (role as WorkspaceRole) : null;

const notAMember = () =>
  new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });

/**
 * Resolve the caller's active membership for the `X-Workspace-Id` selector.
 *
 * `X-Workspace-Id` is a selector, not proof of membership — this is the one
 * place that turns it into a verified membership. Returns `null` when no
 * workspace is selected, the request is unauthenticated, or the caller is not
 * an *active* member (non-member, suspended, or removed — the membership
 * helper reports all three as `null`, and an unknown workspace id produces
 * the same result, so nothing about workspace existence leaks through).
 *
 * Membership is resolved once per request: middlewares that ran earlier
 * attach `ctx.membership`, which is reused only when it was resolved for the
 * same workspace id.
 */
export const resolveWorkspaceMembership = async (
  ctx: MembershipContext,
): Promise<WorkspaceMembership | null> => {
  const workspaceId = ctx.workspaceId;
  if (!workspaceId) return null;

  if (ctx.membership && ctx.membership.workspaceId === workspaceId) return ctx.membership;

  if (!ctx.userId) return null;

  const db = await getServerDB();
  const role = asWorkspaceRole(
    await getActiveWorkspaceMembershipRole(db, { userId: ctx.userId, workspaceId }),
  );
  if (!role) return null;

  return { role, userId: ctx.userId, workspaceId };
};

/**
 * Workspace-scoping middleware: verifies the caller's membership in the
 * workspace named by `X-Workspace-Id`.
 *
 * - No `X-Workspace-Id` → personal mode: passes through with
 *   `workspaceRole: undefined` (the caller is the implicit owner of their
 *   personal space) and no membership.
 * - `X-Workspace-Id` present → the caller must be an active member, otherwise
 *   the request is rejected with FORBIDDEN. It is *never* silently downgraded
 *   to personal — that would mis-target reads and writes at the wrong tenant.
 *   The error is uniform for non-member / suspended / removed / unknown
 *   workspaces so the response cannot leak workspace existence.
 *
 * On success it attaches `membership` + `workspaceRole` for downstream
 * middlewares and procedures, plus `workspaceSlug` (kept for ctx-shape
 * compatibility; this deployment addresses workspaces by id, not slug).
 */
export const cloudWorkspaceAuth = trpc.middleware(async (opts) => {
  const { ctx } = opts;

  if (!ctx.workspaceId) {
    return opts.next({
      ctx: {
        membership: null,
        workspaceRole: undefined,
        workspaceSlug: undefined as string | undefined,
      },
    });
  }

  const membership = await resolveWorkspaceMembership(ctx);
  if (!membership) throw notAMember();

  return opts.next({
    ctx: {
      membership,
      workspaceId: ctx.workspaceId,
      workspaceRole: membership.role,
      workspaceSlug: undefined as string | undefined,
    },
  });
});

// Same enforcement under the other historical name — in this repo there is no
// separate cloud implementation, so both entry points verify membership.
export const lobeWorkspaceAuth = cloudWorkspaceAuth;

/**
 * Require at least `minRole` when a workspace is in scope; personal-mode
 * requests pass through (personal space = implicit owner rights). A caller
 * who is not an active member of the addressed workspace is rejected with
 * FORBIDDEN — never downgraded to personal.
 */
export const requireWorkspaceRole = (minRole: WorkspaceRole) =>
  trpc.middleware(async (opts) => {
    const { ctx } = opts;

    if (!ctx.workspaceId) {
      return opts.next({ ctx: { membership: null, workspaceRole: undefined } });
    }

    const membership = await resolveWorkspaceMembership(ctx);
    if (!membership || !hasMinWorkspaceRole(membership.role, minRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Requires ${minRole} role or higher`,
      });
    }

    return opts.next({
      ctx: { membership, workspaceId: ctx.workspaceId, workspaceRole: membership.role },
    });
  });

// Same semantics as `requireWorkspaceRole`: enforce the role only when the
// request actually addresses a workspace, pass in personal mode.
export const requireWorkspaceRoleWhenScoped = requireWorkspaceRole;

/**
 * Verify an authenticated caller is an active member of the workspace named
 * by `X-Workspace-Id` — the strict variant that requires the selector.
 */
const requireActiveWorkspaceMembership = trpc.middleware(async (opts) => {
  const { ctx } = opts;

  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
  }

  const membership = await resolveWorkspaceMembership(ctx);
  if (!membership) throw notAMember();

  return opts.next({
    ctx: { membership, workspaceId: ctx.workspaceId, workspaceRole: membership.role },
  });
});

export const wsProcedure = authedProcedure.use(requireActiveWorkspaceMembership);

export const wsMemberProcedure = wsProcedure;

export const wsOwnerProcedure = wsMemberProcedure.use(requireWorkspaceRole('owner'));
export const wsAdminProcedure = wsMemberProcedure.use(requireWorkspaceRole('admin'));

export const wsCompatProcedure = authedProcedure.use(cloudWorkspaceAuth);
