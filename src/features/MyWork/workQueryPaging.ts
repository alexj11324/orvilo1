import type { TaskListItem } from '@orvilo/types';

/**
 * A task row inside a work-query result. The server selects full `tasks` rows,
 * so this is the complete task shape; `participants` is the only list-read
 * attachment the work query doesn't join in.
 */
export type WorkQueryResultTask = Omit<TaskListItem, 'participants'> & {
  participants?: TaskListItem['participants'];
};

export const mergeWorkQueryPage = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
  if (current.length === 0) return incoming;
  const seen = new Set(current.map((row) => row.id));
  const extra = incoming.filter((row) => !seen.has(row.id));
  return extra.length === 0 ? current : [...current, ...extra];
};

export const workQueryHasMore = (loaded: number, total: number | undefined) =>
  typeof total === 'number' && loaded < total;

export interface WorkQueryGroupPage<T extends { id: string }> {
  hasMore: boolean;
  key: string;
  tasks: T[];
  total: number;
}

/**
 * Work-query responses are a discriminated union (flat task page, grouped task
 * page, project page). The task surfaces read only the task members; a project
 * response yields empty rows instead of a shape error.
 */
export const workQueryResponseTasks = <T extends { id: string }>(
  data: { tasks?: T[] | undefined } | { projects?: unknown } | undefined,
): T[] => (data && 'tasks' in data ? (data.tasks ?? []) : []);

export const workQueryResponseGroups = <T extends { id: string }>(
  data: { groups?: WorkQueryGroupPage<T>[] | undefined } | { projects?: unknown } | undefined,
): WorkQueryGroupPage<T>[] => (data && 'groups' in data ? (data.groups ?? []) : []);

export const mergeWorkQueryGroups = <T extends { id: string }>(
  current: WorkQueryGroupPage<T>[],
  incoming: WorkQueryGroupPage<T>[],
): WorkQueryGroupPage<T>[] => {
  if (current.length === 0) return incoming;
  const byKey = new Map(current.map((group) => [group.key, group]));
  for (const group of incoming) {
    const previous = byKey.get(group.key);
    byKey.set(group.key, {
      ...group,
      tasks: previous ? mergeWorkQueryPage(previous.tasks, group.tasks) : group.tasks,
    });
  }
  const seen = new Set<string>();
  const next: WorkQueryGroupPage<T>[] = [];
  for (const group of current) {
    const merged = byKey.get(group.key);
    if (!merged) continue;
    next.push(merged);
    seen.add(group.key);
  }
  for (const group of incoming) {
    if (seen.has(group.key)) continue;
    next.push(byKey.get(group.key) ?? group);
  }
  return next;
};
