import type { ProjectUpdate } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { getProjectOverviewUpdateState } from './projectOverviewUpdates';

const update = (id: string, kind: ProjectUpdate['kind']): ProjectUpdate => ({
  authorId: 'user_fixture',
  body: `Synthetic ${kind} body`,
  createdAt: '2026-09-22T00:00:00.000Z',
  id,
  kind,
  projectId: 'project_fixture',
});

describe('getProjectOverviewUpdateState', () => {
  it('keeps an unresolved request distinct from a confirmed empty list', () => {
    expect(getProjectOverviewUpdateState(undefined)).toEqual({
      emptyState: undefined,
      publishedUpdates: [],
    });
  });

  it('marks a resolved list with no records as empty', () => {
    expect(getProjectOverviewUpdateState([])).toEqual({
      emptyState: true,
      publishedUpdates: [],
    });
  });

  it('treats a comments-only response as having no published updates', () => {
    expect(getProjectOverviewUpdateState([update('comment_1', 'comment')])).toEqual({
      emptyState: true,
      publishedUpdates: [],
    });
  });

  it('returns published updates without reporting the empty state', () => {
    const published = update('update_1', 'update');

    expect(getProjectOverviewUpdateState([update('comment_1', 'comment'), published])).toEqual({
      emptyState: false,
      publishedUpdates: [published],
    });
  });
});
