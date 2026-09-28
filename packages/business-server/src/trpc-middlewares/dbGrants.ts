import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getServerDB } from '@/database/core/db-adaptor';
import { permissions, rolePermissions, roles, userRoles } from '@/database/schemas';

/**
 * Structural view of the tRPC context for DB-grant resolution — only the
 * caller and the workspace selector matter.
 */
export interface DbGrantContext {
  userId?: string | null;
  workspaceId?: string | null;
}

/**
 * Permission codes granted by DB-assigned roles. Mirrors `RbacModel`:
 * workspace requests honor only globally-granted roles
 * (`userRoles.workspace_id IS NULL`, e.g. `super_admin`); personal requests
 * union every active grant.
 *
 * `codes` restricts the result to the required set — omit it to list every
 * granted code, e.g. the workspace-auth probe that only needs to know a
 * global grant exists. Callers with an in-code grant set should keep this
 * as a fallback after the set misses, so role-matrix hits never pay for
 * the query.
 */
export const fetchDbGrantedCodes = async (
  ctx: DbGrantContext,
  codes?: string[],
): Promise<Set<string>> => {
  if (!ctx.userId || codes?.length === 0) return new Set();

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
        codes ? inArray(permissions.code, codes) : undefined,
        eq(roles.isActive, true),
        eq(permissions.isActive, true),
        sql`(${userRoles.expiresAt} IS NULL OR ${userRoles.expiresAt} > NOW())`,
      ),
    );

  return new Set(rows.map((row) => row.code));
};
