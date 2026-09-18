import {
  getAllowedScopesForAction,
  getWorkspaceRolePermissionCodes,
  PERMISSION_ACTIONS,
  PERSONAL_DEFAULT_PERMISSIONS,
} from '@orvilo/const/rbac';
import { TRPCError } from '@trpc/server';

import { trpc } from '@/libs/trpc/lambda/init';

import { type DbGrantContext, fetchDbGrantedCodes } from './dbGrants';
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
 *   union `RbacModel` applies on the OpenAPI surface. A non-member holding
 *   such a global grant is evaluated on exactly those DB-granted codes — no
 *   role matrix, never the personal baseline. A non-member without one gets
 *   a uniform FORBIDDEN (no workspace-existence leak), never a silent
 *   downgrade to personal scope.
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

/**
 * Whether `granted` covers the required `codes` under `operator`.
 */
const coversRequiredCodes = (
  granted: ReadonlySet<string>,
  codes: string[],
  operator: 'all' | 'any',
) =>
  operator === 'any'
    ? codes.some((code) => granted.has(code))
    : codes.every((code) => granted.has(code));

const hasRequiredCodes = async (
  ctx: DbGrantContext,
  granted: ReadonlySet<string>,
  codes: string[],
  operator: 'all' | 'any',
): Promise<boolean> => {
  if (codes.length === 0) return operator === 'all';

  if (coversRequiredCodes(granted, codes, operator)) return true;

  const dbGranted = await fetchDbGrantedCodes(ctx, codes);
  return coversRequiredCodes(new Set([...granted, ...dbGranted]), codes, operator);
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
      // A non-member can still hold globally-granted DB roles (e.g.
      // super_admin via `rbac_user_roles.workspace_id IS NULL`) that apply
      // inside any workspace — the same contract RbacModel enforces on the
      // OpenAPI surface. Evaluate exactly those grants: never the role
      // matrix (there is no membership) and never the personal baseline
      // (that would over-grant workspace-domain codes). Without a covering
      // grant the caller is an ordinary non-member → uniform FORBIDDEN.
      const globalGranted = await fetchDbGrantedCodes(ctx, codes);
      if (globalGranted.size === 0 || !coversRequiredCodes(globalGranted, codes, operator)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });
      }

      return opts.next({ ctx: { membership: null, workspaceRole: undefined } });
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
        workspaceRole: membership?.role ?? undefined,
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
