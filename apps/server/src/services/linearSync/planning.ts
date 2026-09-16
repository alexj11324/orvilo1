import type { TaskPlanningProposal, TaskPlanningTrigger } from '@orvilo/types';
import { and, eq } from 'drizzle-orm';

import { LinearSyncModel } from '@/database/models/linearSync';
import type { TaskDomainEventItem, TaskPlanningScopeItem } from '@/database/schemas';
import { taskDependencies, tasks } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

export interface TaskPlanningSnapshot {
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

const semanticEventTypes = new Set([
  'linear.issue.changed',
  'task.assigned',
  'task.created',
  'task.dependency.changed',
  'task.requirement.changed',
  'task.status.changed',
]);

/**
 * Safe default used by the durable worker until a project coordinator is
 * explicitly selected. It records that a coordinator decision is required,
 * rather than silently dispatching an Agent or changing a task.
 */
export const proposeLinearPlanningReview: TaskPlanningPlanner = async (snapshot) => {
  const semanticEvents = snapshot.events.filter((event) => semanticEventTypes.has(event.type));
  const issueIds = Array.from(
    new Set(
      semanticEvents
        .map((event) => (event.payload as Record<string, unknown>).issueId)
        .filter((value): value is string => typeof value === 'string'),
    ),
  );

  if (semanticEvents.length === 0) {
    return {
      actions: [{ action: 'noop', reason: 'No planning-relevant domain changes were found.' }],
      explanation: 'The scope was evaluated and no semantic task change requires replanning.',
      requiresApproval: false,
    };
  }

  return {
    actions: [
      {
        action: 'escalate',
        reason:
          issueIds.length > 0
            ? `Linear issue change requires coordinator review: ${issueIds.join(', ')}`
            : `The planning scope changed in ${semanticEvents.length} event(s).`,
      },
    ],
    explanation:
      'The change was durably captured and the affected task scope was snapshotted. A selected project coordinator must review the bounded scope before task or issue mutations are applied.',
    requiresApproval: true,
  };
};

export interface LinearPlanningWorkerResult {
  failed: number;
  processed: number;
  proposed: number;
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
    planner: TaskPlanningPlanner = proposeLinearPlanningReview,
    limit = 10,
  ): Promise<LinearPlanningWorkerResult> {
    const scopes = await this.model.claimPlanningScopes(limit);
    const result: LinearPlanningWorkerResult = { failed: 0, proposed: 0, processed: 0 };

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
            : await planner(snapshot);
        await this.model.updatePlanningRevision(revision.id, {
          proposal,
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
}
