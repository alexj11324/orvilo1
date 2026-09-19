import type { RecentWorkItem, RecentWorkType } from '@orvilo/types';

const recentWorkKey = (item: Pick<RecentWorkItem, 'id' | 'type'>) => `${item.type}:${item.id}`;

export const toIsoTimestamp = (value: Date | number | string): string => {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
};

const compareRecentWork = (left: RecentWorkItem, right: RecentWorkItem) => {
  const time = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (time !== 0) return time;
  return recentWorkKey(left).localeCompare(recentWorkKey(right));
};

export const takeRecentByUpdatedAt = <T extends { id: string; updatedAt: Date | number | string }>(
  items: T[],
  limit: number,
): T[] =>
  [...items]
    .sort((left, right) =>
      compareRecentWork(
        { id: left.id, title: '', type: 'task', updatedAt: toIsoTimestamp(left.updatedAt) },
        { id: right.id, title: '', type: 'task', updatedAt: toIsoTimestamp(right.updatedAt) },
      ),
    )
    .slice(0, Math.max(0, limit));

export const mergeRecentWork = (groups: RecentWorkItem[][], limit: number): RecentWorkItem[] => {
  const seen = new Set<string>();
  const merged: RecentWorkItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = recentWorkKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, updatedAt: toIsoTimestamp(item.updatedAt) });
    }
  }
  merged.sort(compareRecentWork);
  return merged.slice(0, Math.max(0, limit));
};

const mapRows = (
  rows: Array<{ id: string; title: string; updatedAt: Date | number | string }>,
  type: RecentWorkType,
  perType: number,
): RecentWorkItem[] =>
  takeRecentByUpdatedAt(rows, perType).map((row) => ({
    id: row.id,
    title: row.title,
    type,
    updatedAt: toIsoTimestamp(row.updatedAt),
  }));

export const recentWorkFromSources = (params: {
  limit: number;
  perType: number;
  projects: Array<{ id: string; name: string; updatedAt: Date | number | string }>;
  savedViews: Array<{ id: string; name: string; updatedAt: Date | number | string }>;
  tasks: Array<{
    id: string;
    identifier?: string | null;
    name?: string | null;
    updatedAt: Date | number | string;
  }>;
  teams: Array<{ id: string; name: string; updatedAt: Date | number | string }>;
}): RecentWorkItem[] =>
  mergeRecentWork(
    [
      mapRows(
        params.tasks.map((row) => ({
          id: row.id,
          title: row.name?.trim() || row.identifier?.trim() || row.id,
          updatedAt: row.updatedAt,
        })),
        'task',
        params.perType,
      ),
      mapRows(
        params.projects.map((row) => ({
          id: row.id,
          title: row.name,
          updatedAt: row.updatedAt,
        })),
        'project',
        params.perType,
      ),
      mapRows(
        params.savedViews.map((row) => ({
          id: row.id,
          title: row.name,
          updatedAt: row.updatedAt,
        })),
        'savedView',
        params.perType,
      ),
      mapRows(
        params.teams.map((row) => ({
          id: row.id,
          title: row.name,
          updatedAt: row.updatedAt,
        })),
        'team',
        params.perType,
      ),
    ],
    params.limit,
  );
