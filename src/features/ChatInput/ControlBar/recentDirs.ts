export const RECENT_DIRS_KEY = 'orvilo-recent-working-directories';

export interface RecentDirEntry {
  path: string;
  repoType?: 'git' | 'github';
}

export const getRecentDirs = (): RecentDirEntry[] => {
  try {
    const stored = localStorage.getItem(RECENT_DIRS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) =>
        typeof item === 'string' ? { path: item } : (item as RecentDirEntry),
      )
      .filter((d): d is RecentDirEntry => !!d?.path);
  } catch {
    return [];
  }
};

/**
 * Backfill `repoType` on an existing entry without reordering the list.
 * No-op when the path isn't in recents (avoids polluting recents with
 * implicitly-set working directories from agent config).
 */
export const setRecentDirRepoType = (
  path: string,
  repoType: 'git' | 'github' | undefined,
): void => {
  const dirs = getRecentDirs();
  const idx = dirs.findIndex((d) => d.path === path);
  if (idx === -1) return;
  if (dirs[idx].repoType === repoType) return;
  dirs[idx] = { ...dirs[idx], repoType };
  localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(dirs));
};
