import type { SQL } from 'drizzle-orm';
import { and, eq, exists, ne, not, or, sql } from 'drizzle-orm';

import { agentDocuments } from '../../schemas/agentDocuments';
import { documents } from '../../schemas/file';
import { tasks } from '../../schemas/task';
import { works } from '../../schemas/work';
import type { OrviloDatabase } from '../../type';
import { buildDocumentReadableWhere } from '../../utils/documentAccess';
import { buildTaskReadableWhere } from '../../utils/taskTeamReadable';
import { buildWorkspaceWhere } from '../../utils/workspace';

/**
 * Ambient dependencies every Work query/mutation needs. Passed as the first
 * argument to the per-type free functions instead of `this`, so the per-type
 * modules never import the `WorkModel` facade (keeping the dependency graph
 * acyclic).
 */
export interface WorkContext {
  db: OrviloDatabase;
  userId: string;
  workspaceId?: string;
}

/** Live task ACL; only orphaned Task Works fall back to their registrant. */
const taskVisibilityGuard = (ctx: WorkContext): SQL =>
  or(
    ne(works.resourceType, 'task'),
    exists(
      ctx.db
        .select({ one: sql`1` })
        .from(tasks)
        .where(and(eq(tasks.id, works.resourceId), taskOwnership(ctx))),
    ),
    and(
      eq(works.userId, ctx.userId),
      not(
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(tasks)
            .where(eq(tasks.id, works.resourceId)),
        ),
      ),
    ),
  ) as SQL;

/**
 * Row-level guard for document Works, mirroring {@link taskVisibilityGuard}:
 * `works.visibility` is the indexed primary filter; this live resource check
 * additionally prevents a stale or moved backing document from exposing its
 * Work snapshot. Visible iff the viewer registered the Work themselves OR can
 * see the backing document under the public-or-owner rule.
 *
 * Unlike tasks, `documents.visibility` is NOT NULL default 'public', so there is
 * no null branch to treat as public. Orphaned document Works (backing row
 * hard-deleted outside the tool path) fall back to registrant-only — the same
 * trade-off the task guard makes: an orphan of a formerly-private document never
 * leaks to other members, at the cost of other members also losing orphan cards
 * of public documents.
 */
const documentVisibilityGuard = (ctx: WorkContext): SQL =>
  or(
    ne(works.resourceType, 'document'),
    and(ne(works.visibility, 'team'), eq(works.userId, ctx.userId)),
    exists(
      ctx.db
        .select({ one: sql`1` })
        .from(documents)
        .where(
          and(
            eq(documents.id, works.resourceId),
            buildDocumentReadableWhere(ctx.db, {
              userId: ctx.userId,
              workspaceId: ctx.workspaceId,
            }),
          ),
        ),
    ),
  ) as SQL;

export const workOwnership = (ctx: WorkContext) =>
  and(
    or(
      buildWorkspaceWhere({ userId: ctx.userId, workspaceId: ctx.workspaceId }, works),
      // Legacy Task Work mirrors may still be private. Only a live readable
      // task in the same workspace can override that stored mirror.
      ctx.workspaceId
        ? and(
            eq(works.resourceType, 'task'),
            eq(works.workspaceId, ctx.workspaceId),
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(tasks)
                .where(
                  and(
                    eq(tasks.id, works.resourceId),
                    eq(tasks.workspaceId, works.workspaceId),
                    taskOwnership(ctx),
                  ),
                ),
            ),
          )
        : undefined,
      and(
        eq(works.resourceType, 'document'),
        eq(works.visibility, 'team'),
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(documents)
            .where(
              and(
                eq(documents.id, works.resourceId),
                buildDocumentReadableWhere(ctx.db, {
                  userId: ctx.userId,
                  workspaceId: ctx.workspaceId,
                }),
              ),
            ),
        ),
      ),
    ),
    taskVisibilityGuard(ctx),
    documentVisibilityGuard(ctx),
  ) as SQL;

/** Match the Task metadata reader for registration and live summary joins. */
export const taskOwnership = (ctx: WorkContext) => buildTaskReadableWhere(ctx.db, ctx);

export const documentOwnership = (ctx: WorkContext) =>
  buildDocumentReadableWhere(ctx.db, { userId: ctx.userId, workspaceId: ctx.workspaceId });

export const agentDocumentOwnership = (ctx: WorkContext) =>
  buildWorkspaceWhere({ userId: ctx.userId, workspaceId: ctx.workspaceId }, agentDocuments);
