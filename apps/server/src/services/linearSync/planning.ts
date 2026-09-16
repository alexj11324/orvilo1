import type { TaskPlanningAction, TaskPlanningProposal, TaskPlanningTrigger } from '@orvilo/types';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { LinearSyncModel } from '@/database/models/linearSync';
import { TaskModel } from '@/database/models/task';
import type { TaskDomainEventItem, TaskPlanningScopeItem } from '@/database/schemas';
import {
  linearProjectBindings,
  projects,
  taskDependencies,
  taskPlanningRevisions,
  tasks,
} from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';
import { TaskService } from '@/server/services/task';

import { taskPlanningProposalSchema } from './contract';
import { createLinearCoordinatorPlanner } from './coordinator';

export { proposeLinearPlanningReview } from './defaultPlanner';

export interface TaskPlanningSnapshot {
  consistency: {
    bindingVersion: number | null;
    orchestrationPolicyRevision: number | null;
  };
  dependencies: Array<{ dependsOnId: string; taskId: string; type: string }>;
  events: TaskDomainEventItem[];
  scope: {
    id: string;
    scopeId: string;
    scopeType: TaskPlanningScopeItem['scopeType'];
    revision: number;
  };
  tasks: Array<{
    assigneeAgentId: string | null;
    assigneeUserId: string | null;
    id: string;
    instruction: string;
    name: string | null;
    parentTaskId: string | null;
    priority: number | null;
    projectId: string | null;
    status: string;
    updatedAt: string;
  }>;
}

/** A planner is deliberately injected so model-backed planning cannot bypass the version gate. */
export type TaskPlanningPlanner = (snapshot: TaskPlanningSnapshot) => Promise<TaskPlanningProposal>;

export interface LinearPlanningWorkerResult {
  failed: number;
  processed: number;
  proposed: number;
}

export interface ApplyPlanningProposalResult {
  createdTaskIds: string[];
  stale: boolean;
  updatedTaskIds: string[];
}

export class LinearPlanningWorker {
  private readonly db: LobeChatDatabase;
  private readonly model: LinearSyncModel;
  private readonly workspaceId: string;

  constructor(db: LobeChatDatabase, workspaceId: string) {
    this.db = db;
    this.model = new LinearSyncModel(db, workspaceId);
    this.workspaceId = workspaceId;
  }

  async processPending(
    planner?: TaskPlanningPlanner,
    limit = 10,
  ): Promise<LinearPlanningWorkerResult> {
    const scopes = await this.model.claimPlanningScopes(limit);
    const result: LinearPlanningWorkerResult = { failed: 0, proposed: 0, processed: 0 };
    const coordinatorPlanner = planner ?? createLinearCoordinatorPlanner(this.db, this.workspaceId);

    for (const scope of scopes) {
      try {
        const inputRevision = scope.dirtyRevision;
        const events = await this.model.listDomainEventsForPlanning(
          scope,
          scope.plannedRevision,
          inputRevision,
        );
        const snapshot = await this.snapshot(scope, inputRevision, events);
        const trigger = (scope.lastTrigger as TaskPlanningTrigger | null) ?? {
          source: 'system',
          type: 'task.requirement.changed',
        };
        const revision = await this.model.createPlanningRevision({
          eventIds: events.map((event) => event.id),
          inputRevision,
          inputSnapshot: snapshot as unknown as Record<string, unknown>,
          scopeId: scope.id,
          status: 'running',
          trigger,
        });

        if (revision.proposal && revision.status === 'proposed') {
          await this.model.finishPlanningScope(scope.id, inputRevision, 'idle');
          result.proposed += 1;
          result.processed += 1;
          continue;
        }

        const binding =
          scope.scopeType === 'project'
            ? await this.model.findBindingByProjectId(scope.scopeId)
            : null;
        const proposal =
          binding && !binding.replanningEnabled
            ? {
                actions: [
                  {
                    action: 'noop' as const,
                    reason: 'Project replanning is disabled for this Linear binding.',
                  },
                ],
                explanation:
                  'The event remains recorded for audit, but this project has opted out of automatic replanning.',
                requiresApproval: false,
              }
            : await coordinatorPlanner(snapshot);
        const validatedProposal = taskPlanningProposalSchema.parse(proposal);
        await this.model.updatePlanningRevision(revision.id, {
          proposal: validatedProposal,
          status: 'proposed',
        });
        await this.model.finishPlanningScope(scope.id, inputRevision, 'idle');
        result.proposed += 1;
        result.processed += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await this.model.failPlanningScope(scope.id, message);
      }
    }

    return result;
  }

  /**
   * Apply a coordinator proposal only while its captured scope and task
   * versions are still current. Every task mutation and the planning receipt
   * share one transaction; a later Linear/user event leaves the proposal
   * superseded and asks the caller to plan again.
   */
  async applyProposal(
    revisionId: string,
    userId: string,
    approvalConfirmed: boolean,
  ): Promise<ApplyPlanningProposalResult> {
    return this.db.transaction(async (tx) => {
      const model = new LinearSyncModel(tx, this.workspaceId);
      const [revision] = await tx
        .select()
        .from(taskPlanningRevisions)
        .where(
          and(
            eq(taskPlanningRevisions.id, revisionId),
            eq(taskPlanningRevisions.workspaceId, this.workspaceId),
          ),
        )
        .for('update')
        .limit(1);
      if (!revision || revision.status !== 'proposed') {
        throw new Error('Planning revision is not awaiting application');
      }
      const proposal = taskPlanningProposalSchema.parse(revision.proposal);
      if (proposal.requiresApproval && !approvalConfirmed) {
        throw new Error('Planning proposal requires explicit approval');
      }

      const inputSnapshot = revision.inputSnapshot as {
        consistency?: {
          bindingVersion?: number | null;
          orchestrationPolicyRevision?: number | null;
        };
        tasks?: Array<{ id: string; updatedAt: string }>;
      };
      const existingTaskIds = this.actionTaskIds(proposal.actions);
      const expectedVersions = new Map(
        (inputSnapshot.tasks ?? []).map((task) => [task.id, task.updatedAt]),
      );
      if (existingTaskIds.some((taskId) => !expectedVersions.has(taskId))) {
        throw new Error('Planning proposal references a task outside its captured scope');
      }

      // Lock tasks before the planning scope. User task writes lock the task
      // first and then enqueue the scope event, so this order turns a race into
      // a stale proposal instead of a task/scope deadlock.
      const currentTasks =
        existingTaskIds.length === 0
          ? []
          : await tx
              .select({
                assigneeLocked: tasks.assigneeLocked,
                id: tasks.id,
                priorityLocked: tasks.priorityLocked,
                requirementLocked: tasks.requirementLocked,
                updatedAt: tasks.updatedAt,
              })
              .from(tasks)
              .where(
                and(eq(tasks.workspaceId, this.workspaceId), inArray(tasks.id, existingTaskIds)),
              )
              .for('update');
      const lockedTaskById = new Map(currentTasks.map((task) => [task.id, task]));

      const scope = await model.lockPlanningScope(revision.scopeId);
      if (!scope) throw new Error('Planning scope no longer exists');
      const supersede = async (error: string): Promise<ApplyPlanningProposalResult> => {
        await model.updatePlanningRevision(revision.id, { error, status: 'superseded' });
        await model.finishPlanningScope(scope.id, revision.inputRevision, 'idle');
        return { createdTaskIds: [], stale: true, updatedTaskIds: [] };
      };
      if (scope.dirtyRevision > revision.inputRevision) {
        return supersede('A newer domain event arrived while this proposal was waiting.');
      }

      if (scope.scopeType === 'project' && !inputSnapshot.consistency) {
        // Revisions created before the consistency metadata was added cannot be
        // safely compared with the current project policy, so force a fresh plan.
        return supersede('This planning proposal is missing its consistency snapshot.');
      }
      if (scope.scopeType === 'project') {
        const [binding] = await tx
          .select({ version: linearProjectBindings.version })
          .from(linearProjectBindings)
          .where(
            and(
              eq(linearProjectBindings.workspaceId, this.workspaceId),
              eq(linearProjectBindings.projectId, scope.scopeId),
            ),
          )
          .for('update')
          .limit(1);
        const [project] = await tx
          .select({ orchestrationPolicyRevision: projects.orchestrationPolicyRevision })
          .from(projects)
          .where(and(eq(projects.id, scope.scopeId), eq(projects.workspaceId, this.workspaceId)))
          .for('update')
          .limit(1);
        const expectedConsistency = inputSnapshot.consistency!;
        if (
          (binding?.version ?? null) !== (expectedConsistency.bindingVersion ?? null) ||
          (project?.orchestrationPolicyRevision ?? null) !==
            (expectedConsistency.orchestrationPolicyRevision ?? null)
        ) {
          return supersede('The Linear binding or project policy changed after planning.');
        }
      }

      if (existingTaskIds.length > 0) {
        const currentById = new Map(currentTasks.map((task) => [task.id, task.updatedAt]));
        if (
          currentTasks.length !== new Set(existingTaskIds).size ||
          existingTaskIds.some(
            (taskId) => currentById.get(taskId)?.toISOString() !== expectedVersions.get(taskId),
          )
        ) {
          return supersede('A task changed after this proposal was generated.');
        }

        const humanLockConflict = proposal.actions.some((action) => {
          if (action.action === 'assign_task') {
            return lockedTaskById.get(action.taskId)?.assigneeLocked;
          }
          if (action.action !== 'update_task') return false;
          const task = lockedTaskById.get(action.taskId);
          return Boolean(
            (task &&
              (action.patch.instruction !== undefined || action.patch.name !== undefined) &&
              task.requirementLocked) ||
            (action.patch.priority !== undefined && task?.priorityLocked),
          );
        });
        if (humanLockConflict) {
          return supersede('A human task lock protects a field targeted by this proposal.');
        }
      }

      const taskModel = new TaskModel(tx, userId, this.workspaceId);
      const taskService = new TaskService(tx, userId, this.workspaceId);
      const agentModel = new AgentModel(tx, userId, this.workspaceId);
      const createdTaskIds: string[] = [];
      const updatedTaskIds: string[] = [];

      for (const action of proposal.actions) {
        switch (action.action) {
          case 'assign_task': {
            const task = await taskModel.findById(action.taskId);
            if (!task) throw new Error(`Task ${action.taskId} is not available to this approver`);
            if (action.assigneeAgentId) {
              const exists = await agentModel.existsById(action.assigneeAgentId);
              if (!exists) throw new Error('Planning proposal assignee Agent is not available');
              const agentVisibility = await agentModel.getAgentVisibility(action.assigneeAgentId);
              taskService.assertAgentVisibilityCompat(task.visibility, agentVisibility);
            }
            await taskService.assertAssigneeUserAssignable(action.assigneeUserId);
            taskService.assertAssigneeUserVisibilityCompat(
              task.visibility,
              action.assigneeUserId,
              task.createdByUserId ?? '',
            );
            const updated = await taskService.updateTaskWithAssigneeLock(
              action.taskId,
              {
                assigneeAgentId: action.assigneeAgentId,
                assigneeUserId: action.assigneeUserId,
              },
              { userId },
            );
            if (!updated) throw new Error(`Task ${action.taskId} could not be assigned`);
            const syncChange = await model.recordTaskChangeInTransaction(tx, {
              eventType: 'task.assigned',
              source: 'user',
              task: updated,
            });
            if (!syncChange) {
              await model.recordDomainEventInTransaction(tx, {
                idempotencyKey: `planning:${revision.id}:assigned:${updated.id}`,
                payload: { taskId: updated.id },
                projectId: updated.projectId,
                source: 'user',
                taskId: updated.id,
                type: 'task.assigned',
              });
            }
            updatedTaskIds.push(updated.id);
            break;
          }
          case 'create_task': {
            if (scope.scopeType === 'project' && action.projectId !== scope.scopeId) {
              throw new Error('Planning proposal cannot create a task outside its project scope');
            }
            const created = await taskService.createTask({
              description: action.description,
              instruction: action.instruction,
              name: action.name,
              parentTaskId: action.parentTaskId ?? undefined,
              priority: action.priority,
              projectId: action.projectId,
              visibility: 'public',
            });
            await model.recordDomainEventInTransaction(tx, {
              idempotencyKey: `planning:${revision.id}:task-created:${created.id}`,
              payload: { taskId: created.id, reason: action.reason },
              projectId: created.projectId,
              source: 'user',
              taskId: created.id,
              type: 'task.created',
            });
            createdTaskIds.push(created.id);
            break;
          }
          case 'noop':
          case 'escalate': {
            break;
          }
          case 'request_stop': {
            throw new Error('request_stop proposals require the task stop coordinator');
          }
          case 'set_dependency': {
            await this.applyDependencyAction(tx, taskModel, action, userId);
            await model.recordDomainEventInTransaction(tx, {
              idempotencyKey: `planning:${revision.id}:dependency:${action.taskId}:${action.dependsOnTaskId}:${action.operation}`,
              payload: action,
              projectId: scope.scopeType === 'project' ? scope.scopeId : undefined,
              source: 'user',
              taskId: action.taskId,
              type: 'task.dependency.changed',
            });
            break;
          }
          case 'update_task': {
            const updated = await taskService.updateTaskWithAssigneeLock(
              action.taskId,
              {
                instruction: action.patch.instruction,
                name: action.patch.name,
                priority: action.patch.priority,
              },
              { userId },
            );
            if (!updated) throw new Error(`Task ${action.taskId} could not be updated`);
            const syncChange = await model.recordTaskChangeInTransaction(tx, {
              eventType: 'task.requirement.changed',
              source: 'user',
              task: updated,
            });
            if (!syncChange) {
              await model.recordDomainEventInTransaction(tx, {
                idempotencyKey: `planning:${revision.id}:updated:${updated.id}`,
                payload: { taskId: updated.id, patch: action.patch },
                projectId: updated.projectId,
                source: 'user',
                taskId: updated.id,
                type: 'task.requirement.changed',
              });
            }
            updatedTaskIds.push(updated.id);
            break;
          }
        }
      }

      await model.updatePlanningRevision(revision.id, {
        appliedAt: new Date(),
        error: null,
        status: 'applied',
      });
      await model.finishPlanningScope(scope.id, revision.inputRevision, 'idle');
      return { createdTaskIds, stale: false, updatedTaskIds };
    });
  }

  private actionTaskIds(actions: TaskPlanningAction[]) {
    return Array.from(
      new Set(
        actions.flatMap((action) => {
          switch (action.action) {
            case 'assign_task':
            case 'request_stop':
            case 'update_task': {
              return [action.taskId];
            }
            case 'set_dependency': {
              return [action.taskId, action.dependsOnTaskId];
            }
            default: {
              return [];
            }
          }
        }),
      ),
    );
  }

  private async applyDependencyAction(
    tx: LobeChatDatabase,
    taskModel: TaskModel,
    action: Extract<TaskPlanningAction, { action: 'set_dependency' }>,
    userId: string,
  ) {
    const [task, dependency] = await Promise.all([
      taskModel.findById(action.taskId),
      taskModel.findById(action.dependsOnTaskId),
    ]);
    if (!task || !dependency) throw new Error('Planning dependency references an unavailable task');
    if (action.taskId === action.dependsOnTaskId) {
      throw new Error('A task cannot depend on itself');
    }

    if (action.operation === 'remove') {
      await tx
        .delete(taskDependencies)
        .where(
          and(
            eq(taskDependencies.workspaceId, this.workspaceId),
            eq(taskDependencies.taskId, action.taskId),
            eq(taskDependencies.dependsOnId, action.dependsOnTaskId),
          ),
        );
      return;
    }

    const cycle = await tx.execute(sql`
      WITH RECURSIVE reachable(id) AS (
        SELECT depends_on_id
        FROM task_dependencies
        WHERE task_id = ${action.dependsOnTaskId}
          AND workspace_id = ${this.workspaceId}
        UNION
        SELECT dependencies.depends_on_id
        FROM task_dependencies AS dependencies
        JOIN reachable ON dependencies.task_id = reachable.id
        WHERE dependencies.workspace_id = ${this.workspaceId}
      )
      SELECT 1 FROM reachable WHERE id = ${action.taskId} LIMIT 1
    `);
    if (cycle.rows.length > 0) throw new Error('Planning proposal would create a dependency cycle');

    await tx
      .insert(taskDependencies)
      .values({
        dependsOnId: action.dependsOnTaskId,
        taskId: action.taskId,
        type: 'blocks',
        userId,
        visibility: task.visibility,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({ target: [taskDependencies.taskId, taskDependencies.dependsOnId] });
  }

  private async snapshot(
    scope: TaskPlanningScopeItem,
    revision: number,
    events: TaskDomainEventItem[],
  ): Promise<TaskPlanningSnapshot> {
    const taskRows = await this.db
      .select({
        assigneeAgentId: tasks.assigneeAgentId,
        assigneeUserId: tasks.assigneeUserId,
        id: tasks.id,
        instruction: tasks.instruction,
        name: tasks.name,
        parentTaskId: tasks.parentTaskId,
        priority: tasks.priority,
        projectId: tasks.projectId,
        status: tasks.status,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, this.workspaceId),
          scope.scopeType === 'project' ? eq(tasks.projectId, scope.scopeId) : undefined,
        ),
      )
      .orderBy(tasks.updatedAt)
      .limit(500);

    const taskIds = taskRows.map((task) => task.id);
    const dependencyRows =
      taskIds.length === 0
        ? []
        : await this.db
            .select({
              dependsOnId: taskDependencies.dependsOnId,
              taskId: taskDependencies.taskId,
              type: taskDependencies.type,
            })
            .from(taskDependencies)
            .where(eq(taskDependencies.workspaceId, this.workspaceId));

    return {
      consistency:
        scope.scopeType === 'project'
          ? await this.projectConsistencySnapshot(scope.scopeId)
          : { bindingVersion: null, orchestrationPolicyRevision: null },
      dependencies: dependencyRows.filter(
        (dependency) =>
          taskIds.includes(dependency.taskId) || taskIds.includes(dependency.dependsOnId),
      ),
      events,
      scope: {
        id: scope.id,
        scopeId: scope.scopeId,
        scopeType: scope.scopeType,
        revision,
      },
      tasks: taskRows.map((task) => ({
        ...task,
        updatedAt: task.updatedAt.toISOString(),
      })),
    };
  }

  private async projectConsistencySnapshot(projectId: string) {
    const [[binding], [project]] = await Promise.all([
      this.db
        .select({ version: linearProjectBindings.version })
        .from(linearProjectBindings)
        .where(
          and(
            eq(linearProjectBindings.workspaceId, this.workspaceId),
            eq(linearProjectBindings.projectId, projectId),
          ),
        )
        .limit(1),
      this.db
        .select({ orchestrationPolicyRevision: projects.orchestrationPolicyRevision })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, this.workspaceId)))
        .limit(1),
    ]);

    return {
      bindingVersion: binding?.version ?? null,
      orchestrationPolicyRevision: project?.orchestrationPolicyRevision ?? null,
    };
  }
}
