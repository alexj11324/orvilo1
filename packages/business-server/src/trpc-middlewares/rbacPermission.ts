import {
  getAllowedScopesForAction,
  getWorkspaceRolePermissionCodes,
  PERMISSION_ACTIONS,
  PERSONAL_DEFAULT_PERMISSIONS,
} from '@orvilo/const/rbac';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getServerDB } from '@/database/core/db-adaptor';
import { permissions, rolePermissions, roles, userRoles } from '@/database/schemas';
import { trpc } from '@/libs/trpc/lambda/init';

import { resolveWorkspaceMembership, type WorkspaceMembership } from './workspaceAuth';

/**
 * Real workspace-RBAC enforcement for tRPC procedures (this repo has no
 * separate cloud override — this module IS the implementation).
 *
 * Permission set resolution:
 * - Workspace-scoped (`ctx.workspaceId` set): the caller's
 *   `workspace_members.role` expanded through the in-code
 *   `WORKSPACE_ROLE_PERMISSIONS` matrix, plus globally-granted DB roles
 *   (`rbac_user_roles.workspace_id IS NULL`, e.g. `super_admin`) — the same
 *   union `RbacModel` applies on the OpenAPI surface. Non-members get a
 *   uniform FORBIDDEN (no workspace-existence leak), never a silent downgrade
 *   to personal scope.
 * - Personal mode (no `X-Workspace-Id`): `PERSONAL_DEFAULT_PERMISSIONS` plus
 *   every workspace-domain code — the caller is the implicit owner of their
 *   personal space, so personal export / credential / settings flows keep
 *   working. System administration codes (`rbac:*`, `user:create/delete`)
 *   stay withheld: they still require explicitly assigned DB roles.
 *
 * On success the resolved `workspaceRole`/`membership` are attached to ctx —
 * row-level ownership helpers (`assertWorkspaceRowManageable`,
 * `isWorkspaceNonOwner`) read them to enforce `:owner`-scoped grants.
 */

/**
 * Personal-mode baseline: the `:owner` grant set over own content plus all
 * workspace-domain codes (the personal space is the caller's own workspace).
 * `getAllowedScopesForAction` maps every `workspace*` resource to ALL-only,
 * so `:all` is the only scope these codes exist in.
 */
const PERSONAL_MODE_CODES: ReadonlySet<string> = new Set([
  ...PERSONAL_DEFAULT_PERMISSIONS,
  ...Object.values(PERMISSION_ACTIONS)
    .filter((code) => code.startsWith('workspace'))
    .map((code) => `${code}:all`),
]);

const ACTION_KEY_BY_VALUE = new Map<string, keyof typeof PERMISSION_ACTIONS>(
  Object.entries(PERMISSION_ACTIONS).map(([key, value]) => [
    value,
    key as keyof typeof PERMISSION_ACTIONS,
  ]),
);

/**
 * Fan an action value (`'agent:update'`) out into its allowed scoped codes
 * (`['agent:update:all', 'agent:update:owner']`), mirroring
 * `getAllowedScopesForAction`. Actions outside `PERMISSION_ACTIONS` fall back
 * to the default `ALL | OWNER` pair — the same default the const helper uses.
 */
const scopedCodesForAction = (action: string): string[] => {
  const key = ACTION_KEY_BY_VALUE.get(action);
  const scopes = key ? getAllowedScopesForAction(key) : (['ALL', 'OWNER'] as const);
  return scopes.map((scope) => `${action}:${scope.toLowerCase()}`);
};

interface RbacContext {
  userId?: string | null;
  workspaceId?: string | null;
}

/**
 * Permission codes from DB-assigned roles only, restricted to `codes`.
 * Mirrors `RbacModel`: workspace requests honor only globally-granted roles
 * (`userRoles.workspace_id IS NULL`); personal requests union every active
 * grant. Used as a fallback after the in-code set misses, so role-matrix hits
 * never pay for this query.
 */
const fetchDbGrantedCodes = async (ctx: RbacContext, codes: string[]): Promise<Set<string>> => {
  if (!ctx.userId || codes.length === 0) return new Set();

  const db = await getServerDB();
  const rows = await db
    .select({ code: permissions.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(userRoles.userId, ctx.userId),
        ctx.workspaceId ? isNull(userRoles.workspaceId) : undefined,
        inArray(permissions.code, codes),
        eq(roles.isActive, true),
        eq(permissions.isActive, true),
        sql`(${userRoles.expiresAt} IS NULL OR ${userRoles.expiresAt} > NOW())`,
      ),
    );

  return new Set(rows.map((row) => row.code));
};

const hasRequiredCodes = async (
  ctx: RbacContext,
  granted: ReadonlySet<string>,
  codes: string[],
  operator: 'all' | 'any',
): Promise<boolean> => {
  if (codes.length === 0) return operator === 'all';

  const check = (set: ReadonlySet<string>) =>
    operator === 'any' ? codes.some((code) => set.has(code)) : codes.every((code) => set.has(code));

  if (check(granted)) return true;

  const dbGranted = await fetchDbGrantedCodes(ctx, codes);
  return check(new Set([...granted, ...dbGranted]));
};

const permissionMiddleware = (codes: string[], operator: 'all' | 'any') =>
  trpc.middleware(async (opts) => {
    const { ctx } = opts;

    // Membership reuse: when a workspace-auth middleware already ran this is
    // the ctx-attached resolution; otherwise it is verified here once.
    const membership: WorkspaceMembership | null = ctx.workspaceId
      ? await resolveWorkspaceMembership(ctx)
      : null;

    if (ctx.workspaceId && !membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });
    }

    const granted: ReadonlySet<string> = membership
      ? new Set(getWorkspaceRolePermissionCodes(membership.role))
      : PERSONAL_MODE_CODES;

    if (!(await hasRequiredCodes(ctx, granted, codes, operator))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Insufficient permissions: requires ${
          operator === 'any' ? 'any of' : 'all of'
        } ${codes.join(', ')}`,
      });
    }

    return opts.next({
      ctx: {
        membership,
        workspaceRole: membership?.role ?? null,
      },
    });
  });

export const withRbacPermission = (code: string) => permissionMiddleware([code], 'any');

export const withAnyRbacPermission = (codes: string[]) => permissionMiddleware(codes, 'any');

export const withAllRbacPermissions = (codes: string[]) => permissionMiddleware(codes, 'all');

/**
 * "Member-or-owner" gate: fans the action out into its allowed
 * `:all | :owner` scope pair so a member holding the `:owner` grant passes
 * alongside an owner holding `:all`. Resources that only define the `ALL`
 * scope (workspace domain, agent_label, session_group, rbac, user
 * create/delete) fan out to their single `:all` code.
 */
export const withScopedPermission = (action: string) =>
  permissionMiddleware(scopedCodesForAction(action), 'any');
