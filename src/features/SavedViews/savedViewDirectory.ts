import type { SavedViewVisibility, WorkQueryEntityType } from '@orvilo/types';

export const viewEntityFromSearch = (search: string): WorkQueryEntityType =>
  new URLSearchParams(search).get('entity') === 'project' ? 'project' : 'task';

export const filterSavedViewsByEntity = <T extends { entityType: WorkQueryEntityType }>(
  views: readonly T[],
  entityType: WorkQueryEntityType,
  keyword: string,
  title: (view: T) => string,
): T[] => {
  const needle = keyword.trim().toLocaleLowerCase();
  return views.filter(
    (view) =>
      view.entityType === entityType &&
      (!needle || title(view).toLocaleLowerCase().includes(needle)),
  );
};

/**
 * Directory sections follow the reference's visibility wording, not record
 * provenance: a private view is always the visitor's own (other people's
 * private views are never readable), everything shared — workspace or team —
 * lands in the shared section. The reference only observed `Personal views ·
 * Only visible to you`; the shared label mirrors that sentence style.
 */
export type SavedViewDirectorySectionKey = 'personal' | 'shared';

export const savedViewSectionKey = (view: {
  visibility: SavedViewVisibility;
}): SavedViewDirectorySectionKey => (view.visibility === 'private' ? 'personal' : 'shared');

export type SavedViewDirectoryOrdering = 'created' | 'name' | 'owner' | 'updated';
export type SavedViewDirectoryDirection = 'asc' | 'desc';

/** Display options for the directory — matches the reference popover. */
export interface SavedViewDirectoryPrefs {
  direction: SavedViewDirectoryDirection;
  ordering: SavedViewDirectoryOrdering;
  showCreated: boolean;
  showOwner: boolean;
  showUpdated: boolean;
}

export const DEFAULT_SAVED_VIEW_DIRECTORY_PREFS: SavedViewDirectoryPrefs = {
  direction: 'asc',
  ordering: 'name',
  showCreated: false,
  showOwner: true,
  showUpdated: false,
};

const ORDERINGS: readonly SavedViewDirectoryOrdering[] = ['name', 'owner', 'updated', 'created'];

const timestamp = (value: Date | string | null | undefined): number => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/**
 * Ordering applies inside each section — the reference directory sorts the
 * rows of a group, never merges groups into one flat list.
 */
export const sortSavedViewDirectory = <
  T extends { createdAt?: Date | string | null; updatedAt?: Date | string | null },
>(
  views: readonly T[],
  prefs: SavedViewDirectoryPrefs,
  accessors: { ownerName: (view: T) => string; title: (view: T) => string },
): T[] => {
  const direction = prefs.direction === 'desc' ? -1 : 1;
  return [...views].sort((left, right) => {
    const result =
      prefs.ordering === 'name'
        ? accessors.title(left).localeCompare(accessors.title(right))
        : prefs.ordering === 'owner'
          ? accessors.ownerName(left).localeCompare(accessors.ownerName(right))
          : timestamp(prefs.ordering === 'created' ? left.createdAt : left.updatedAt) -
            timestamp(prefs.ordering === 'created' ? right.createdAt : right.updatedAt);
    return direction * result;
  });
};

const PREFS_PREFIX = 'orvilo:views-directory:';

export const savedViewDirectoryPrefsKey = (
  workspaceId: string | null | undefined,
  entityType: WorkQueryEntityType,
): string => `${PREFS_PREFIX}${workspaceId ?? 'personal'}:${entityType}`;

/**
 * Tolerates corrupt/partial payloads — every field falls back to the default
 * independently so a stale stored shape never breaks the directory.
 */
export const parseSavedViewDirectoryPrefs = (
  raw: string | null | undefined,
): SavedViewDirectoryPrefs => {
  if (!raw) return { ...DEFAULT_SAVED_VIEW_DIRECTORY_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<SavedViewDirectoryPrefs> | null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SAVED_VIEW_DIRECTORY_PREFS };
    return {
      direction: parsed.direction === 'desc' ? 'desc' : 'asc',
      ordering: ORDERINGS.includes(parsed.ordering as SavedViewDirectoryOrdering)
        ? (parsed.ordering as SavedViewDirectoryOrdering)
        : DEFAULT_SAVED_VIEW_DIRECTORY_PREFS.ordering,
      showCreated: parsed.showCreated === true,
      showOwner: parsed.showOwner !== false,
      showUpdated: parsed.showUpdated === true,
    };
  } catch {
    return { ...DEFAULT_SAVED_VIEW_DIRECTORY_PREFS };
  }
};

const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage;

/** Directory display options are a per-user preference — localStorage, not
 * the saved_views.displayOptions column (that one belongs to a view). */
export const readSavedViewDirectoryPrefs = (
  workspaceId: string | null | undefined,
  entityType: WorkQueryEntityType,
): SavedViewDirectoryPrefs => {
  if (!isBrowser()) return { ...DEFAULT_SAVED_VIEW_DIRECTORY_PREFS };
  try {
    return parseSavedViewDirectoryPrefs(
      window.localStorage.getItem(savedViewDirectoryPrefsKey(workspaceId, entityType)),
    );
  } catch {
    return { ...DEFAULT_SAVED_VIEW_DIRECTORY_PREFS };
  }
};

export const writeSavedViewDirectoryPrefs = (
  workspaceId: string | null | undefined,
  entityType: WorkQueryEntityType,
  prefs: SavedViewDirectoryPrefs,
): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      savedViewDirectoryPrefsKey(workspaceId, entityType),
      JSON.stringify(prefs),
    );
  } catch {
    /* full storage / restricted context — best-effort only */
  }
};
