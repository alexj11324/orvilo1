import type {
  SavedViewNeedsRepairReason,
  SavedViewVisibility,
  WorkQuery,
  WorkQueryEntityType,
  WorkQueryLayout,
} from '@orvilo/types';
import { notificationScopeKey } from '@orvilo/types';
import { and, desc, eq, or, type SQL, sql } from 'drizzle-orm';

import { teamMembers } from '../schemas/team';
import type { NewSavedView, SavedViewItem } from '../schemas/workAttention';
import { savedViews } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';
import { validateWorkQuery, WorkQueryError, WorkQueryModel } from './workQuery';

export interface SavedViewEvaluation {
  needsRepair: boolean;
  needsRepairReason?: SavedViewNeedsRepairReason;
  projects?: Awaited<ReturnType<WorkQueryModel['queryProjects']>>['projects'];
  queryHash: string;
  tasks?: Awaited<ReturnType<WorkQueryModel['queryTasks']>>['tasks'];
  total: number;
}

const isKnownRepair = (error: WorkQueryError): SavedViewNeedsRepairReason | undefined => {
  if (error.code !== 'INVALID_QUERY') return undefined;
  if (error.message.startsWith('Unknown field')) return 'unknown_field';
  if (error.message.startsWith('Unknown operator')) return 'unknown_operator';
  if (error.message.includes('status')) return 'expired_status';
  return 'unknown_field';
};

export class SavedViewConflictError extends Error {
  readonly code = 'SAVED_VIEW_VERSION_CONFLICT' as const;

  constructor() {
    super('SAVED_VIEW_VERSION_CONFLICT');
    this.name = 'SavedViewConflictError';
  }
}

/**
 * Saved views store query configuration, not a copy of tasks. Evaluation always
 * runs as the visitor, so a shared "assigned to me" view is per-viewer.
 */
export class SavedViewModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private readable = (): SQL => {
    const owner = eq(savedViews.ownerUserId, this.userId);
    if (!this.workspaceId) {
      return and(owner, sql`${savedViews.workspaceId} is null`)!;
    }
    const inWorkspace = eq(savedViews.workspaceId, this.workspaceId);
    const sharedWorkspace = and(inWorkspace, eq(savedViews.visibility, 'workspace'));
    const sharedTeam = and(
      inWorkspace,
      eq(savedViews.visibility, 'team'),
      sql`exists (select 1 from ${teamMembers} where ${teamMembers.teamId} = ${savedViews.teamId} and ${teamMembers.userId} = ${this.userId})`,
    );
    return and(inWorkspace, or(owner, sharedWorkspace, sharedTeam))!;
  };

  list = async (): Promise<SavedViewItem[]> => {
    return this.db
      .select()
      .from(savedViews)
      .where(this.readable())
      .orderBy(desc(savedViews.updatedAt), desc(savedViews.id));
  };

  findById = async (id: string): Promise<SavedViewItem | undefined> => {
    const [row] = await this.db
      .select()
      .from(savedViews)
      .where(and(eq(savedViews.id, id), this.readable()))
      .limit(1);
    return row;
  };

  create = async (params: {
    displayOptions?: Record<string, unknown>;
    entityType: WorkQueryEntityType;
    layout?: WorkQueryLayout;
    name: string;
    query: WorkQuery;
    teamId?: string | null;
    visibility?: SavedViewVisibility;
  }): Promise<SavedViewItem> => {
    validateWorkQuery(params.query);
    if (params.query.entityType !== params.entityType) {
      throw new WorkQueryError('INVALID_QUERY', 'entityType must match the query');
    }
    const [row] = await this.db
      .insert(savedViews)
      .values({
        displayOptions: params.displayOptions ?? {},
        entityType: params.entityType,
        layout: params.layout ?? params.query.layout ?? 'list',
        name: params.name,
        ownerUserId: this.userId,
        queryAst: params.query,
        teamId: params.teamId ?? null,
        visibility: params.visibility ?? 'private',
        workspaceId: this.workspaceId ?? null,
      } satisfies NewSavedView)
      .returning();
    return row;
  };

  update = async (
    id: string,
    patch: {
      displayOptions?: Record<string, unknown>;
      expectedDefinitionVersion: number;
      layout?: WorkQueryLayout;
      name?: string;
      query?: WorkQuery;
      teamId?: string | null;
      visibility?: SavedViewVisibility;
    },
  ): Promise<SavedViewItem | undefined> => {
    if (patch.query) validateWorkQuery(patch.query);
    const [row] = await this.db
      .update(savedViews)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
        ...(patch.displayOptions !== undefined ? { displayOptions: patch.displayOptions } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
        ...(patch.teamId !== undefined ? { teamId: patch.teamId } : {}),
        ...(patch.query !== undefined ? { queryAst: patch.query } : {}),
        definitionVersion: sql`${savedViews.definitionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(savedViews.id, id),
          eq(savedViews.ownerUserId, this.userId),
          eq(savedViews.definitionVersion, patch.expectedDefinitionVersion),
        ),
      )
      .returning();
    if (row) return row;

    const [owned] = await this.db
      .select({ id: savedViews.id })
      .from(savedViews)
      .where(and(eq(savedViews.id, id), eq(savedViews.ownerUserId, this.userId)))
      .limit(1);
    if (!owned) return undefined;
    throw new SavedViewConflictError();
  };

  delete = async (id: string): Promise<boolean> => {
    const deleted = await this.db
      .delete(savedViews)
      .where(and(eq(savedViews.id, id), eq(savedViews.ownerUserId, this.userId)))
      .returning({ id: savedViews.id });
    return deleted.length > 0;
  };

  evaluate = async (
    view: SavedViewItem,
    params: { afterId?: string; limit?: number } = {},
  ): Promise<SavedViewEvaluation> => {
    const query = view.queryAst;
    const kernel = new WorkQueryModel(this.db, this.userId, this.workspaceId);
    try {
      validateWorkQuery(query);
      if (query.entityType === 'project') {
        const result = await kernel.queryProjects({ limit: params.limit, query });
        return {
          needsRepair: false,
          projects: result.projects,
          queryHash: result.queryHash,
          total: result.total,
        };
      }
      const result = await kernel.queryTasks({
        afterId: params.afterId,
        limit: params.limit,
        query,
      });
      return {
        needsRepair: false,
        queryHash: result.queryHash,
        tasks: result.tasks,
        total: result.total,
      };
    } catch (error) {
      if (error instanceof WorkQueryError) {
        return {
          needsRepair: true,
          needsRepairReason: isKnownRepair(error),
          queryHash: JSON.stringify(query),
          tasks: [],
          total: 0,
        };
      }
      throw error;
    }
  };

  scopeKey = () => notificationScopeKey(this.workspaceId);
}
