export const mergeWorkQueryPage = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
  if (current.length === 0) return incoming;
  const seen = new Set(current.map((row) => row.id));
  const extra = incoming.filter((row) => !seen.has(row.id));
  return extra.length === 0 ? current : [...current, ...extra];
};

export const workQueryHasMore = (loaded: number, total: number | undefined) =>
  typeof total === 'number' && loaded < total;
