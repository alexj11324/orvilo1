import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Workspace-aware ownership predicate for content tables.
 *
 * Compat mode semantics:
 * - `ctx.workspaceId` set → row belongs to that team workspace. By default
 *   visible to all members; `user_id` only records the creator and isn't part
 *   of the filter. When a `visibility` column is provided, private rows are
 *   additionally constrained to `user_id = ctx.userId` so each member only
 *   sees their own private items. Additionally, the caller's own unfiled rows
 *   (`workspace_id IS NULL` — written before workspaces became mandatory)
 *   follow them into the workspace view so activating a workspace never
 *   hides data; they stay invisible to other members.
 * - `ctx.workspaceId` absent → legacy personal scope: row belongs to a single
 *   user with `workspace_id IS NULL` (visibility is ignored — every personal
 *   row is implicitly private to its owner). Reserved for pre-provisioning
 *   reads; new writes always carry a workspace id.
 *
 * Used by content router models (agent / session / message / file / topic …)
 * to replace the previous `userId = ?` only filter.
 *
 * @example Model-side
 * ```ts
 * import { buildWorkspaceWhere } from '../utils/workspace';
 *
 * class AgentModel {
 *   constructor(db, userId, workspaceId) { ... }
 *
 *   findById = (id) =>
 *     this.db.query.agents.findFirst({
 *       where: and(
 *         eq(agents.id, id),
 *         buildWorkspaceWhere(
 *           { userId: this.userId, workspaceId: this.workspaceId },
 *           agents,
 *         ),
 *       ),
 *     });
 * }
 * ```
 */
interface WorkspaceWhereContext {
  /**
   * Visibility of the agent that owns the calling tool execution.
   *
   * - `'public'` — workspace-shared agent: rows scoped to the caller as
   *   "private" are excluded. Prevents a public agent from reading its
   *   caller's private data (e.g. private Pages) and echoing them back
   *   into a shared surface. Mirrors the task side's
   *   `assertAgentVisibilityCompat` (`public task ≠ private agent`).
   * - `'private'` / `null` / omitted — no tightening. Reads flow through
   *   the standard "public rows + own private rows" filter, so a private
   *   agent (or a direct TRPC call) can still see the caller's private
   *   content.
   */
  callerAgentVisibility?: 'private' | 'public' | null;
  userId: string;
  workspaceId?: string;
}

type WorkspaceWhereColumns = {
  userId: AnyPgColumn;
  visibility?: AnyPgColumn;
  workspaceId: AnyPgColumn;
};

export function buildWorkspaceWhere(ctx: WorkspaceWhereContext, cols: WorkspaceWhereColumns): SQL {
  return buildWorkspaceScope(ctx, cols, true);
}

/**
 * Strict per-scope variant of {@link buildWorkspaceWhere}: in workspace mode
 * the caller's unfiled rows do NOT follow them in. Use for per-scope
 * namespaces — identity dedupe, external-account attribution, identifier
 * resolution — where an unfiled row and a filed row sharing a natural key
 * must resolve to two distinct rows rather than collapse into one.
 */
export function buildStrictWorkspaceWhere(
  ctx: WorkspaceWhereContext,
  cols: WorkspaceWhereColumns,
): SQL {
  return buildWorkspaceScope(ctx, cols, false);
}

function buildWorkspaceScope(
  ctx: WorkspaceWhereContext,
  cols: WorkspaceWhereColumns,
  includeOwnerUnfiled: boolean,
): SQL {
  if (!ctx.workspaceId) {
    return and(eq(cols.userId, ctx.userId), isNull(cols.workspaceId)) as SQL;
  }

  const workspaceMatch = eq(cols.workspaceId, ctx.workspaceId);

  // The caller's own unfiled rows (workspace_id IS NULL — written before a
  // workspace existed for the account) follow the caller into workspace scope:
  // they are owner-private by construction, so other members never see them.
  const unfiledMine = includeOwnerUnfiled
    ? (and(isNull(cols.workspaceId), eq(cols.userId, ctx.userId)) as SQL)
    : undefined;

  if (!cols.visibility) {
    return (unfiledMine ? or(workspaceMatch, unfiledMine) : workspaceMatch) as SQL;
  }

  // Public agent gate: drop the "creator's own private rows" branch so a
  // workspace-public agent cannot read caller-private content even when it
  // holds the caller's session (which would otherwise grant that access).
  // Unfiled rows stay out too — they are caller-private by construction.
  if (ctx.callerAgentVisibility === 'public') {
    const publicOnly = or(isNull(cols.visibility), eq(cols.visibility, 'public')) as SQL;
    return and(workspaceMatch, publicOnly) as SQL;
  }

  // Workspace + visibility-aware mode: every member sees public rows; private
  // rows are scoped to their creator. NULL visibility is treated as public for
  // backwards compatibility with rows that pre-date the column.
  const visibilityFilter = or(
    isNull(cols.visibility),
    eq(cols.visibility, 'public'),
    and(eq(cols.visibility, 'private'), eq(cols.userId, ctx.userId)),
  ) as SQL;

  const scoped = and(workspaceMatch, visibilityFilter) as SQL;
  return (unfiledMine ? or(scoped, unfiledMine) : scoped) as SQL;
}

/**
 * Companion to `buildWorkspaceWhere` for INSERT payloads.
 *
 * Always sets `userId` (the creator) and `workspaceId` (nullable). Personal-mode
 * writes get `workspaceId: null`; team-mode writes get the workspace id.
 *
 * @example
 * ```ts
 * await db.insert(agents).values(
 *   buildWorkspacePayload(
 *     { userId: ctx.userId, workspaceId: ctx.workspaceId },
 *     { title: input.title, description: input.description },
 *   ),
 * );
 * ```
 */
export function buildWorkspacePayload<T extends object>(
  ctx: { userId: string; workspaceId?: string },
  base: T,
): T & { userId: string; workspaceId: string | null } {
  return {
    ...base,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId ?? null,
  };
}
