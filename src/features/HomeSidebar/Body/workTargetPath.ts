import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';

/** Paths for typed work targets (favorites, CommandMenu recents, search). */
export const workTargetPath = (type: string, id: string, title?: string | null) => {
  if (type === 'task') return taskDetailPath(id, undefined, title);
  if (type === 'project') return `/project/${id}`;
  if (type === 'savedView') return `/views/${id}`;
  if (type === 'team') return `/teams/${id}`;
  return '/';
};
