import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';

interface TeamTaskLink {
  assigneeAgentId?: string | null;
  id: string;
  identifier?: string | null;
  name?: string | null;
}

/** Team issue links resolve by the visible issue identifier. */
export const teamTaskDetailPath = (task: TeamTaskLink) =>
  taskDetailPath(task.identifier || task.id, task.assigneeAgentId ?? undefined, task.name);
