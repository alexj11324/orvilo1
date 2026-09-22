import { describe, expect, it } from 'vitest';

import { buildSavedViewDetailSummary } from './savedViewDetails';

describe('buildSavedViewDetailSummary', () => {
  it('keeps live group order and totals for the details pane', () => {
    expect(
      buildSavedViewDetailSummary({
        entityType: 'task',
        groupBy: 'status',
        groups: [
          { key: 'running', total: 4 },
          { key: 'paused', total: 0 },
        ],
        layout: 'list',
        total: 4,
        visibility: 'private',
      }),
    ).toEqual({
      entityType: 'task',
      groupBy: 'status',
      groups: [
        { key: 'running', total: 4 },
        { key: 'paused', total: 0 },
      ],
      layout: 'list',
      total: 4,
      visibility: 'private',
    });
  });

  it('uses the flat-list defaults before evaluation metadata arrives', () => {
    expect(
      buildSavedViewDetailSummary({
        entityType: 'project',
        visibility: 'workspace',
      }),
    ).toEqual({
      entityType: 'project',
      groupBy: 'none',
      groups: [],
      layout: 'list',
      total: 0,
      visibility: 'workspace',
    });
  });
});
