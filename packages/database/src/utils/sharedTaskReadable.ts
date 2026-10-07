import { and, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { workspaceMembers } from '../schemas/workspace';
import { buildWorkspaceWhere } from './workspace';

interface IssueReadColumns {
  userId: AnyPgColumn;
  visibility?: AnyPgColumn;
  workspaceId: AnyPgColumn;
}

/** Workspace Issues are public to active members; legacy visibility does not grant Agent Use. */
export const buildSharedTaskReadableWhere = (
  ctx: { userId: string; workspaceId?: string },
  columns: IssueReadColumns,
): SQL => {
  const scope = buildWorkspaceWhere(ctx, {
    userId: columns.userId,
    workspaceId: columns.workspaceId,
  });
  if (!ctx.workspaceId) return scope;
  return and(
    scope,
    or(
      isNull(columns.workspaceId),
      sql`exists (select 1 from ${workspaceMembers} issue_member
        where issue_member.workspace_id = ${columns.workspaceId}
          and issue_member.user_id = ${ctx.userId}
          and issue_member.deleted_at is null and issue_member.suspended_at is null)`,
    ),
  )!;
};
