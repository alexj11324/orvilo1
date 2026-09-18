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
