import { and, eq, inArray } from 'drizzle-orm';

import { goals } from '@/database/schemas/goal';
import { goalNodes } from '@/database/schemas/goalGraph';
import type { LobeChatDatabase } from '@/database/type';

export interface GoalTaskOwner {
  goalId: string;
}

export interface GoalTaskOwnershipAdapter {
  findOwners: (taskIds: string[]) => Promise<Map<string, GoalTaskOwner>>;
}

/**
 * Goal Graph ownership is the source of truth for project-planner boundaries.
 * Keep this lookup behind an adapter so planning can read the boundary without
 * importing or starting the Goal coordinator itself.
 */
export const createGoalTaskOwnershipAdapter = (
  db: LobeChatDatabase,
  workspaceId: string,
): GoalTaskOwnershipAdapter => ({
  findOwners: async (taskIds) => {
    if (taskIds.length === 0) return new Map();

    const rows = await db
      .select({ goalId: goalNodes.goalId, taskId: goalNodes.taskId })
      .from(goalNodes)
      .innerJoin(goals, eq(goalNodes.goalId, goals.id))
      .where(
        and(
          eq(goals.workspaceId, workspaceId),
          eq(goalNodes.kind, 'task'),
          inArray(goalNodes.taskId, taskIds),
        ),
      );

    const owners = new Map<string, GoalTaskOwner>();
    for (const row of rows) {
      if (!row.taskId) continue;
      const previous = owners.get(row.taskId);
      if (previous && previous.goalId !== row.goalId) {
        throw new Error(`Task ${row.taskId} is owned by multiple Goal graphs`);
      }
      owners.set(row.taskId, { goalId: row.goalId });
    }
    return owners;
  },
});

export const projectPlannerOwnershipError = (owners: Map<string, GoalTaskOwner>) => {
  const first = owners.entries().next();
  if (first.done) return undefined;
  const [taskId, owner] = first.value;
  return `Task ${taskId} is owned by Goal ${owner.goalId}; the Goal coordinator is the only planner allowed to mutate or start it.`;
};
