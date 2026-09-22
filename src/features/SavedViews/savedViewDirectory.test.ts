import { describe, expect, it } from 'vitest';

import { filterSavedViewsByEntity, viewEntityFromSearch } from './savedViewDirectory';

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
