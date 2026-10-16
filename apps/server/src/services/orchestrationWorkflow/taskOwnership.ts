import { and, eq, inArray } from 'drizzle-orm';

import { orchestrationWorkflows } from '@/database/schemas/orchestrationWorkflow';
import { orchestrationWorkflowNodes } from '@/database/schemas/orchestrationWorkflowGraph';
import type { OrviloDatabase } from '@/database/type';

export interface OrchestrationWorkflowTaskOwner {
  orchestrationWorkflowId: string;
}

export interface OrchestrationWorkflowTaskOwnershipAdapter {
  findOwners: (taskIds: string[]) => Promise<Map<string, OrchestrationWorkflowTaskOwner>>;
}

/**
 * OrchestrationWorkflow Graph ownership is the source of truth for project-planner boundaries.
 * Keep this lookup behind an adapter so planning can read the boundary without
 * importing or starting the OrchestrationWorkflow coordinator itself.
 */
export const startOrchestrationWorkflowTaskOwnershipAdapter = (
  db: OrviloDatabase,
  workspaceId: string,
): OrchestrationWorkflowTaskOwnershipAdapter => ({
  findOwners: async (taskIds) => {
    if (taskIds.length === 0) return new Map();

    const rows = await db
      .select({
        orchestrationWorkflowId: orchestrationWorkflowNodes.orchestrationWorkflowId,
        taskId: orchestrationWorkflowNodes.taskId,
      })
      .from(orchestrationWorkflowNodes)
      .innerJoin(
        orchestrationWorkflows,
        eq(orchestrationWorkflowNodes.orchestrationWorkflowId, orchestrationWorkflows.id),
      )
      .where(
        and(
          eq(orchestrationWorkflows.workspaceId, workspaceId),
          eq(orchestrationWorkflowNodes.kind, 'task'),
          inArray(orchestrationWorkflowNodes.taskId, taskIds),
        ),
      );

    const owners = new Map<string, OrchestrationWorkflowTaskOwner>();
    for (const row of rows) {
      if (!row.taskId) continue;
      const previous = owners.get(row.taskId);
      if (previous && previous.orchestrationWorkflowId !== row.orchestrationWorkflowId) {
        throw new Error(`Task ${row.taskId} is owned by multiple Orchestration workflow graphs`);
      }
      owners.set(row.taskId, { orchestrationWorkflowId: row.orchestrationWorkflowId });
    }
    return owners;
  },
});

export const projectPlannerOwnershipError = (
  owners: Map<string, OrchestrationWorkflowTaskOwner>,
) => {
  const first = owners.entries().next();
  if (first.done) return undefined;
  const [taskId, owner] = first.value;
  return `Task ${taskId} is owned by Orchestration workflow ${owner.orchestrationWorkflowId}; the Orchestration workflow coordinator is the only planner allowed to mutate or start it.`;
};
