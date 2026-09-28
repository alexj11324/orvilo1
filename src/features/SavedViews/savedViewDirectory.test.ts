import { beforeEach, describe, expect, it } from 'vitest';

import {
  filterSavedViewsByEntity,
  parseSavedViewDirectoryPrefs,
  readSavedViewDirectoryPrefs,
  type SavedViewDirectoryPrefs,
  savedViewSectionKey,
  sortSavedViewDirectory,
  viewEntityFromSearch,
  writeSavedViewDirectoryPrefs,
} from './savedViewDirectory';

const views = [
  { entityType: 'task', id: 'builtin:all', name: 'All tasks' },
  { entityType: 'project', id: 'builtin:projects', name: 'All projects' },
  { entityType: 'task', id: 'view-issue', name: 'Sprint bugs' },
  { entityType: 'project', id: 'view-project', name: 'Priority projects' },
] as const;

describe('saved view directory entity tabs', () => {
  it('defaults to issues and restores the project tab from the URL', () => {
    expect(viewEntityFromSearch('')).toBe('task');
    expect(viewEntityFromSearch('?entity=project')).toBe('project');
    expect(viewEntityFromSearch('?entity=invalid')).toBe('task');
  });

  it('keeps built-ins and user views in their own entity tab', () => {
    expect(
      filterSavedViewsByEntity(views, 'task', '', (view) => view.name).map((v) => v.id),
    ).toEqual(['builtin:all', 'view-issue']);
    expect(
      filterSavedViewsByEntity(views, 'project', '', (view) => view.name).map((v) => v.id),
    ).toEqual(['builtin:projects', 'view-project']);
  });

  it('searches titles only within the selected entity', () => {
    expect(
      filterSavedViewsByEntity(views, 'project', 'PRIORITY', (view) => view.name).map((v) => v.id),
    ).toEqual(['view-project']);
  });
});

describe('savedViewSectionKey', () => {
  it('groups private views under personal and everything else under shared', () => {
    expect(savedViewSectionKey({ visibility: 'private' })).toBe('personal');
    expect(savedViewSectionKey({ visibility: 'team' })).toBe('shared');
    expect(savedViewSectionKey({ visibility: 'workspace' })).toBe('shared');
  });
});

describe('sortSavedViewDirectory', () => {
  const directory = [
    {
      createdAt: '2024-03-01T00:00:00Z',
      id: 'c',
      ownerUserId: 'u-b',
      title: 'charlie',
      updatedAt: '2024-03-03T00:00:00Z',
    },
    {
      createdAt: '2024-01-01T00:00:00Z',
      id: 'a',
      ownerUserId: 'u-a',
      title: 'Alpha',
      updatedAt: '2024-01-03T00:00:00Z',
    },
    {
      createdAt: '2024-02-01T00:00:00Z',
      id: 'b',
      ownerUserId: 'u-c',
      title: 'bravo',
      updatedAt: '2024-02-03T00:00:00Z',
    },
  ];
  const ownerNames: Record<string, string> = { 'u-a': 'Zed', 'u-b': 'Amy', 'u-c': 'Max' };
  const resolvers = {
    ownerName: (view: { ownerUserId: string }) => ownerNames[view.ownerUserId] ?? '',
    title: (view: { title: string }) => view.title,
  };
  const ids = (prefs: Partial<SavedViewDirectoryPrefs>) =>
    sortSavedViewDirectory(directory, { ...prefs } as SavedViewDirectoryPrefs, resolvers).map(
      (v) => v.id,
    );

  it('sorts by name case-insensitively and honors direction', () => {
    expect(ids({ direction: 'asc', ordering: 'name' })).toEqual(['a', 'b', 'c']);
    expect(ids({ direction: 'desc', ordering: 'name' })).toEqual(['c', 'b', 'a']);
  });

  it('sorts by owner display name, not owner id', () => {
    // u-b owns 'c' but is named Amy — owner sort must follow the resolved name.
    expect(ids({ direction: 'asc', ordering: 'owner' })).toEqual(['c', 'b', 'a']);
  });

  it('sorts by created/updated timestamps', () => {
    expect(ids({ direction: 'asc', ordering: 'created' })).toEqual(['a', 'b', 'c']);
    expect(ids({ direction: 'desc', ordering: 'updated' })).toEqual(['c', 'b', 'a']);
  });

  it('falls back to updated timestamps for unknown ordering values', () => {
    // 'nope' isn't reachable through prefs parsing, but a direct call must
    // still produce a deterministic order rather than crashing.
    expect(ids({ direction: 'asc', ordering: 'nope' as never })).toEqual(['a', 'b', 'c']);
    expect(ids({ direction: 'desc', ordering: 'nope' as never })).toEqual(['c', 'b', 'a']);
  });
});

describe('saved view directory prefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults for missing or malformed stored values', () => {
    expect(parseSavedViewDirectoryPrefs(null)).toEqual({
      direction: 'asc',
      ordering: 'name',
      showCreated: false,
      showOwner: true,
      showUpdated: false,
    });
    expect(parseSavedViewDirectoryPrefs('{oops')).toEqual(parseSavedViewDirectoryPrefs(null));
    expect(
      parseSavedViewDirectoryPrefs('{"ordering":"owner","direction":"desc","showUpdated":true}'),
    ).toEqual({
      direction: 'desc',
      ordering: 'owner',
      showCreated: false,
      showOwner: true,
      showUpdated: true,
    });
  });

  it('scopes storage to workspace + entity tab and round-trips', () => {
    writeSavedViewDirectoryPrefs('ws-1', 'project', {
      direction: 'desc',
      ordering: 'updated',
      showCreated: true,
      showOwner: false,
      showUpdated: true,
    });
    expect(readSavedViewDirectoryPrefs('ws-1', 'project')).toEqual({
      direction: 'desc',
      ordering: 'updated',
      showCreated: true,
      showOwner: false,
      showUpdated: true,
    });
    // The issues tab and other workspaces keep their own defaults.
    expect(readSavedViewDirectoryPrefs('ws-1', 'task')).toEqual(parseSavedViewDirectoryPrefs(null));
    expect(readSavedViewDirectoryPrefs('ws-2', 'project')).toEqual(
      parseSavedViewDirectoryPrefs(null),
    );
  });

  it('stores prefs under the personal scope when no workspace is active', () => {
    const prefs: SavedViewDirectoryPrefs = {
      direction: 'desc',
      ordering: 'created',
      showCreated: true,
      showOwner: false,
      showUpdated: true,
    };
    writeSavedViewDirectoryPrefs(undefined, 'task', prefs);
    expect(readSavedViewDirectoryPrefs(undefined, 'task')).toEqual(prefs);
    // ...and never leaks into a real workspace scope.
    expect(readSavedViewDirectoryPrefs('ws-1', 'task')).toEqual(parseSavedViewDirectoryPrefs(null));
  });
});
