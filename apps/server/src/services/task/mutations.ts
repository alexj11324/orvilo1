import type { TaskItem, TaskMoveScope, TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { inArray, sql } from 'drizzle-orm';

import { TaskDomainError } from '@/database/errors/task';
import { linearBindingWriteEnabled, LinearSyncModel } from '@/database/models/linearSync';
import { TaskModel } from '@/database/models/task';
import type { TaskRelationRejectionReason } from '@/database/models/taskDependency';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TeamModel } from '@/database/models/team';
import { tasks } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import { assertAgentVisibleTo } from '@/database/utils/agent-access';
import {
  lockTaskDependencyGraphForRows,
  taskDependencyLockScopes,
  taskDependencyRequestScope,
  taskDependencyRowScope,
} from '@/database/utils/taskDependencyLock';

import { EditLockService } from '../editLock';
import { assertCanUseWorkspaceAgent } from '../resourcePermission/workspaceAgentGuard';
import { hasWorkspaceScopedPermission } from '../workspacePermission';
import {
  assertAssigneeAgentVisibleToCaller,
  assertTaskExecutionUse,
  resolveActivityActor,
} from './access';
import { TaskService } from './index';

export interface TaskMutationScope {
  actingAgentId?: string | null;
  serverDB: OrviloDatabase;
  userId: string;
  workspaceId?: string | null;
}

export type UpdateTaskInput = Omit<Parameters<TaskModel['update']>[1], 'status'> & {
  actorAgentId?: string;
  afterId?: string | null;
  beforeId?: string | null;
  expectedDomainRevision?: number;
  id: string;
  moveScope?: TaskMoveScope;
  status?: TaskStatus;
};

async function resolveOrThrow(model: TaskModel, id: string) {
  const task = await model.resolve(id);
  if (!task) throw new TaskDomainError({ code: 'NOT_FOUND', message: 'Task not found' });
  return task;
}

/** Application use cases shared by RPC, jobs and tools. Owns tree locks and write transactions. */
export class TaskMutationService {
  private readonly ctx;

  constructor(scope: TaskMutationScope) {
    const { serverDB: db, userId, workspaceId } = scope;
    const wsId = workspaceId ?? undefined;
    this.ctx = {
      ...scope,
      editLockService: new EditLockService(userId),
      taskModel: new TaskModel(db, userId, wsId),
      taskService: new TaskService(db, userId, wsId),
      taskTopicModel: new TaskTopicModel(db, userId, wsId),
      teamModel: new TeamModel(db, userId, wsId ?? ''),
    };
  }

  private async assertWritePermission() {
    const { serverDB, userId, workspaceId } = this.ctx;
    if (
      workspaceId &&
      !(await hasWorkspaceScopedPermission({
        action: 'AGENT_UPDATE',
        db: serverDB,
        // Match the transport permission gate: global RBAC grants remain valid
        // for non-members, while an ordinary viewer has no write grant.
        requireMembership: false,
        userId,
        workspaceId,
      }))
    ) {
      throw new TaskDomainError({
        code: 'FORBIDDEN',
        message: 'Workspace Issue write access required',
      });
    }
  }

  async update(input: UpdateTaskInput) {
    const ctx = this.ctx;
    await this.assertWritePermission();
    const {
      actorAgentId,
      afterId,
      beforeId,
      expectedDomainRevision,
      id,
      moveScope,
      parentTaskId,
      status,
      ...data
    } = input;
    // Assignee edits are domain-critical: without a revision CAS a stale
    // client silently overwrites a concurrent reassignment (lost update).
    // Every first-party caller resolves `expectedDomainRevision` before
    // writing; anything else must fetch the task and retry.
    if (
      (data.assigneeAgentId !== undefined ||
        data.assigneeUserId !== undefined ||
        data.reviewerAgentId !== undefined) &&
      expectedDomainRevision === undefined
    ) {
      throw new TaskDomainError({
        code: 'BAD_REQUEST',
        message: 'expectedDomainRevision is required when changing a task assignee or reviewer',
      });
    }
    const model = ctx.taskModel;
    const actor = await resolveActivityActor(ctx, actorAgentId);
    await assertAssigneeAgentVisibleToCaller(
      ctx.serverDB,
      { userId: ctx.userId, workspaceId: ctx.workspaceId ?? undefined },
      data.assigneeAgentId,
    );
    const resolved = await resolveOrThrow(model, id);
    if (data.context) {
      data.context = {
        ...resolved.context,
        ...data.context,
      };
    }
    if (status !== undefined) {
      await assertTaskExecutionUse(
        ctx,
        [resolved],
        [
          ...(['running', 'scheduled'].includes(status)
            ? [data.assigneeAgentId ?? resolved.assigneeAgentId]
            : []),
        ],
      );
    }

    let workflowPatch:
      | {
          workflowCategory: TaskWorkflowCategory;
          workflowStateId?: string | null;
          workflowStateRefId?: string | null;
        }
      | undefined;
    if (data.workflowCategory !== undefined) {
      const linearSyncModel = ctx.workspaceId
        ? new LinearSyncModel(ctx.serverDB, ctx.workspaceId)
        : null;
      const issueLink = linearSyncModel
        ? await linearSyncModel.findIssueLinkByTaskId(resolved.id)
        : null;
      const binding =
        issueLink?.bindingId && linearSyncModel
          ? await linearSyncModel.findBindingById(issueLink.bindingId)
          : null;
      if (issueLink && binding) {
        if (!linearBindingWriteEnabled(binding)) {
          throw new TaskDomainError({
            code: 'PRECONDITION_FAILED',
            message: 'Linear workflow writes are unavailable for this task',
          });
        }

        const targetMappings = (binding.settings.statusMappings ?? []).filter(
          (mapping) => mapping.workflowCategory === data.workflowCategory,
        );
        if (targetMappings.length === 0) {
          throw new TaskDomainError({
            code: 'PRECONDITION_FAILED',
            message: `No Linear state is mapped to ${data.workflowCategory}`,
          });
        }
        if (targetMappings.length > 1) {
          throw new TaskDomainError({
            code: 'PRECONDITION_FAILED',
            message: `Multiple Linear states are mapped to ${data.workflowCategory}; choose one in workspace settings`,
          });
        }
        workflowPatch = {
          workflowCategory: data.workflowCategory,
          workflowStateId: targetMappings[0].linearStateId,
        };
      } else if (issueLink?.linearTeamId && resolved.teamId && linearSyncModel) {
        // Team-scope links carry no project binding — category moves resolve
        // through the team's imported workflow states (lowest position wins).
        const teamLink = await linearSyncModel.findTeamLinkByLinearTeamId(issueLink.linearTeamId);
        if (!teamLink || teamLink.syncState !== 'synced') {
          throw new TaskDomainError({
            code: 'PRECONDITION_FAILED',
            message: 'Linear workflow writes are unavailable for this task',
          });
        }
        const [targetState] = (await ctx.teamModel.listWorkflowStates(resolved.teamId))
          .filter(
            (state) => state.category === data.workflowCategory && state.remoteStateId !== null,
          )
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        if (!targetState) {
          throw new TaskDomainError({
            code: 'PRECONDITION_FAILED',
            message: `No Linear state is mapped to ${data.workflowCategory}`,
          });
        }
        workflowPatch = {
          workflowCategory: data.workflowCategory,
          workflowStateId: targetState.remoteStateId!,
          workflowStateRefId: targetState.id,
        };
      } else if (issueLink) {
        throw new TaskDomainError({
          code: 'PRECONDITION_FAILED',
          message: 'Linear workflow writes are unavailable for this task',
        });
      } else {
        // No Linear linkage — a plain workflow-category move. Local tasks
        // carry no remote state ids; the category alone is the source of
        // truth (same shape as workAttention.moveBoard's non-team path).
        workflowPatch = { workflowCategory: data.workflowCategory };
      }
    }

    // Collaborative edit lock: reject writes to a workspace task another member
    // is actively editing. Inert until a client acquires the lock.
    if (ctx.workspaceId) {
      const blockedBy = await ctx.editLockService.getBlockingHolder('task', resolved.id);
      if (blockedBy) {
        throw new TaskDomainError({
          cause: { data: { code: 'DocumentLocked' } },
          code: 'CONFLICT',
          message: 'Task is being edited by another user',
        });
      }
    }

    await ctx.taskService.assertAssigneeUserAssignable(data.reviewerUserId);
    if (data.reviewerAgentId) {
      await assertAgentVisibleTo(ctx.serverDB, data.reviewerAgentId, {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId ?? undefined,
      });
      await assertCanUseWorkspaceAgent({
        agentId: data.reviewerAgentId,
        db: ctx.serverDB,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
    }

    const resolvedParentTaskId =
      parentTaskId === undefined
        ? undefined
        : await resolveSafeParentTaskId(model, resolved.id, parentTaskId);

    const updateData = {
      ...data,
      ...workflowPatch,
      ...(parentTaskId === undefined ? {} : { parentTaskId: resolvedParentTaskId }),
    };
    // `instruction` is the markdown source of truth while `editorData` is its
    // rich-text mirror. Text-only callers (for example the editTask builtin)
    // cannot produce Lexical JSON, so discard the stale mirror and let the
    // editor rebuild from markdown. Callers that provide both fields keep
    // their explicit editor state.
    const normalizedUpdateData =
      updateData.instruction !== undefined && updateData.editorData === undefined
        ? { ...updateData, editorData: null }
        : updateData;

    // Kanban drop anchors resolve to a fractional position against the
    // live rows (the board may have shifted while the drag was in flight).
    // When both anchors vanished mid-drag the write keeps its explicit
    // `position` (or none) rather than failing the whole update.
    const movePosition =
      beforeId || afterId
        ? await model.computeMovePosition(
            { afterId, beforeId },
            moveScope ?? undefined,
            resolved.id,
          )
        : null;
    const finalUpdateData =
      movePosition === null
        ? normalizedUpdateData
        : { ...normalizedUpdateData, position: movePosition };
    // Agent attribution comes from `resolveActivityActor` above. The
    // assignment activity is written inside this update's own transaction
    // (see `TaskModel.updateWithLog`), so a concurrent reassignment cannot
    // interleave between reading the old assignee and recording it.
    const commit = (db: OrviloDatabase) =>
      status
        ? db.transaction(async (tx) => {
            const taskService = new TaskService(tx, ctx.userId, ctx.workspaceId ?? undefined);
            const updated = await taskService.updateTaskWithAssigneeLock(
              resolved.id,
              finalUpdateData,
              actor,
              { expectedDomainRevision },
            );
            if (!updated) return null;

            const result = await taskService.updateStatus({ id: resolved.id, status }, actor);
            return result.task;
          })
        : new TaskService(db, ctx.userId, ctx.workspaceId ?? undefined).updateTaskWithAssigneeLock(
            resolved.id,
            finalUpdateData,
            actor,
            {
              expectedDomainRevision,
            },
          );
    // Giving an Issue a parent re-validates under the scope's graph lock,
    // in the transaction that writes it. The checks above ran on a snapshot
    // a concurrent parent change could already have invalidated.
    const parentRow = resolvedParentTaskId
      ? await resolveOrThrow(model, resolvedParentTaskId)
      : null;
    const task = resolvedParentTaskId
      ? await ctx.serverDB.transaction(async (tx) => {
          // Lock order on every assignment path is member row, then graph:
          // take the member row here before the graph lock, not after it.
          await ctx.taskService.lockAssigneeUser(tx, data.assigneeUserId);
          // Keyed by the rows' own scopes as well as the request's — see
          // `taskDependencyRowScope`.
          await lockParentWrite(tx, ctx, [resolved, ...(parentRow ? [parentRow] : [])]);
          await resolveSafeParentTaskId(
            new TaskModel(tx, ctx.userId, ctx.workspaceId ?? undefined),
            resolved.id,
            resolvedParentTaskId,
          );
          await assertParentChainExcludes(tx, resolvedParentTaskId, [resolved.id]);
          return commit(tx);
        })
      : await commit(ctx.serverDB);
    if (!task) throw new TaskDomainError({ code: 'NOT_FOUND', message: 'Task not found' });
    if (data.reviewerAgentId && task.reviewerAgentId !== resolved.reviewerAgentId) {
      const { resumeReviewerAssignment } = await import('./reviewerAssignment');
      await resumeReviewerAssignment(
        ctx.serverDB,
        ctx.userId,
        task.id,
        ctx.workspaceId ?? task.workspaceId ?? undefined,
      );
    }
    return { task, previousAssigneeUserId: resolved.assigneeUserId };
  }

  async setParentBatch(input: { parentTaskId: string; taskIds: string[] }) {
    const ctx = this.ctx;
    await this.assertWritePermission();
    const actor = await resolveActivityActor(ctx);
    const parent = await resolveOrThrow(ctx.taskModel, input.parentTaskId);
    const children: TaskItem[] = [];
    for (const taskId of input.taskIds) {
      const child = await resolveOrThrow(ctx.taskModel, taskId);
      if (children.some((task) => task.id === child.id)) continue;
      children.push(child);
    }
    // Same collaborative edit lock `update` honours, per child.
    if (ctx.workspaceId) {
      for (const child of children) {
        if (await ctx.editLockService.getBlockingHolder('task', child.id)) {
          throw new TaskDomainError({
            cause: { data: { code: 'DocumentLocked' } },
            code: 'CONFLICT',
            message: `${child.identifier} is being edited by another user`,
          });
        }
      }
    }

    const updated = await ctx.serverDB.transaction(async (tx) => {
      // Serialize with every other tree and graph write in this scope
      // before reading: two requests that would each pass alone cannot
      // both validate against the same stale tree and then both write.
      // The rows' own scopes as well as the request's: the caller's unfiled
      // Issues are writable from several contexts — see `taskDependencyRowScope`.
      await lockParentWrite(tx, ctx, [parent, ...children]);
      const model = new TaskModel(tx, ctx.userId, ctx.workspaceId ?? undefined);
      const taskService = new TaskService(tx, ctx.userId, ctx.workspaceId ?? undefined);
      const rows: TaskItem[] = [];
      // Validate the selection as a set against the rows this transaction
      // sees under that lock, before any of them is written.
      await assertParentChainExcludes(
        tx,
        parent.id,
        children.map((child) => child.id),
      );
      for (const child of children) {
        const parentTaskId = await resolveSafeParentTaskId(model, child.id, parent.id);
        const row = await taskService.updateTaskWithAssigneeLock(child.id, { parentTaskId }, actor);
        if (!row) throw new TaskDomainError({ code: 'NOT_FOUND', message: 'Task not found' });
        rows.push(row);
      }
      return rows;
    });
    return updated;
  }
}

/** A sub-issue tree deeper than this is treated as corrupt and never extended. */
const PARENT_CHAIN_MAX_DEPTH = 200;

/**
 * Set-level cycle guard for a batch parent write. `resolveSafeParentTaskId`
 * walks down from each child through the Issues the caller can read, so an
 * Issue hidden from the caller in the middle of the chain would hide a cycle.
 * This walks up from the parent over the raw rows instead: if any Issue about
 * to become a child is the parent or one of its ancestors, the batch is
 * refused. The walk is bounded by tree depth, and a chain that does not end
 * within the bound is refused rather than waved through.
 */
async function assertParentChainExcludes(
  db: Pick<OrviloDatabase, 'execute'>,
  parentId: string,
  childIds: string[],
) {
  if (childIds.includes(parentId)) {
    throw new TaskDomainError({
      cause: { data: { code: 'SELF' satisfies TaskRelationRejectionReason } },
      code: 'BAD_REQUEST',
      message: 'Task cannot be parented to itself',
    });
  }
  const chain = await db.execute(sql`
    WITH RECURSIVE chain(id, parent_task_id, depth) AS (
      SELECT t.id, t.parent_task_id, 0 FROM tasks t WHERE t.id = ${parentId}
      UNION ALL
      SELECT p.id, p.parent_task_id, c.depth + 1 FROM tasks p
      JOIN chain c ON p.id = c.parent_task_id
      WHERE c.depth < ${PARENT_CHAIN_MAX_DEPTH}
    )
    SELECT id, parent_task_id, depth FROM chain
  `);
  const rows = chain.rows as { depth: number; id: string; parent_task_id: string | null }[];
  const chainIds = new Set(rows.map((row) => row.id));
  // The parent was resolved before the lock; it can have been deleted since.
  if (!chainIds.has(parentId)) {
    throw new TaskDomainError({ code: 'NOT_FOUND', message: 'Task not found' });
  }
  if (childIds.some((id) => chainIds.has(id))) {
    throw new TaskDomainError({
      cause: { data: { code: 'CYCLE' satisfies TaskRelationRejectionReason } },
      code: 'BAD_REQUEST',
      message: 'Task cannot be parented to its own descendant',
    });
  }
  // No child is in the chain, but the chain itself is unusable: deeper than
  // the bound, or looping without ever reaching a root. Refused all the same,
  // under its own reason — the selection did not cause it.
  if (!rows.some((row) => row.parent_task_id === null)) {
    throw new TaskDomainError({
      cause: { data: { code: 'BROKEN_PARENT_CHAIN' satisfies TaskRelationRejectionReason } },
      code: 'BAD_REQUEST',
      message: 'Parent task has a parent chain that is too deep or loops',
    });
  }
}

/**
 * Take the graph locks for a parent write, then confirm they are still the
 * right ones. The lock set comes from rows read before the transaction; a
 * workspace transfer could have moved one of them since, leaving this write
 * holding the wrong scope. Re-read the rows' scope columns under the lock and
 * refuse with CONFLICT if the set changed, so the caller retries on fresh rows.
 */
async function lockParentWrite(
  tx: OrviloDatabase,
  request: { userId: string; workspaceId?: string | null },
  rows: Pick<TaskItem, 'createdByUserId' | 'id' | 'workspaceId'>[],
) {
  const locked = await lockTaskDependencyGraphForRows(tx, request, rows);
  const ids = [...new Set(rows.map((row) => row.id))];
  const current = await tx
    .select({
      createdByUserId: tasks.createdByUserId,
      id: tasks.id,
      workspaceId: tasks.workspaceId,
    })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  const now = taskDependencyLockScopes(
    taskDependencyRequestScope(request.userId, request.workspaceId),
    current,
  );
  if (current.length !== ids.length || now.join('\n') !== locked.join('\n')) {
    throw new TaskDomainError({
      code: 'CONFLICT',
      message: 'An issue in this change was moved or deleted. Reload and try again.',
    });
  }
}

async function resolveSafeParentTaskId(
  model: TaskModel,
  taskId: string,
  parentTaskId: string | null,
): Promise<string | null> {
  if (parentTaskId === null) return null;

  const parent = await resolveOrThrow(model, parentTaskId);
  if (parent.id === taskId) {
    throw new TaskDomainError({
      cause: { data: { code: 'SELF' satisfies TaskRelationRejectionReason } },
      code: 'BAD_REQUEST',
      message: 'Task cannot be parented to itself',
    });
  }

  // The cycle check is `assertParentChainExcludes`, run by every caller under
  // the graph lock: proving the task is not among the parent's raw ancestors
  // is the same fact as "the parent is not a descendant of the task", without
  // loading the task's whole subtree.
  const task = await resolveOrThrow(model, taskId);
  // A sub-issue tree stays inside one scope — one workspace, or one person's
  // unfiled Issues. That is what makes the two rows' scope locks cover the
  // whole ancestor chain the cycle check reads. Links that already cross
  // scopes are left alone; only new ones are refused.
  if (taskDependencyRowScope(task) !== taskDependencyRowScope(parent)) {
    throw new TaskDomainError({
      cause: { data: { code: 'CROSS_SCOPE' satisfies TaskRelationRejectionReason } },
      code: 'BAD_REQUEST',
      message: 'Parent task must belong to the same workspace',
    });
  }
  if (task.projectId !== parent.projectId) {
    throw new TaskDomainError({
      cause: { data: { code: 'CROSS_PROJECT' satisfies TaskRelationRejectionReason } },
      code: 'BAD_REQUEST',
      message: 'Parent task must belong to the same project',
    });
  }

  return parent.id;
}
