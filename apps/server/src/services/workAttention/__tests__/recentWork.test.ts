import { describe, expect, it } from 'vitest';

import {
  mergeRecentWork,
  recentWorkFromSources,
  takeRecentByUpdatedAt,
  toIsoTimestamp,
} from '../recentWork';

describe('toIsoTimestamp', () => {
  it('keeps Date and ISO strings, and treats junk as the epoch', () => {
    expect(toIsoTimestamp(new Date('2026-09-18T12:00:00.000Z'))).toBe('2026-09-18T12:00:00.000Z');
    expect(toIsoTimestamp('2026-09-17T00:00:00.000Z')).toBe('2026-09-17T00:00:00.000Z');
    expect(toIsoTimestamp('not-a-date')).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('mergeRecentWork', () => {
  it('dedupes type:id, sorts by updatedAt, and caps the list', () => {
    expect(
      mergeRecentWork(
        [
          [
            {
              id: 't1',
              title: 'Old task',
              type: 'task',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            {
              id: 't1',
              title: 'Duplicate task',
              type: 'task',
              updatedAt: '2026-09-20T00:00:00.000Z',
            },
          ],
          [
            {
              id: 'p1',
              title: 'Project',
              type: 'project',
              updatedAt: '2026-09-18T00:00:00.000Z',
            },
            {
              id: 'v1',
              title: 'View',
              type: 'savedView',
              updatedAt: '2026-09-19T00:00:00.000Z',
            },
          ],
        ],
        2,
      ),
    ).toEqual([
      { id: 'v1', title: 'View', type: 'savedView', updatedAt: '2026-09-19T00:00:00.000Z' },
      { id: 'p1', title: 'Project', type: 'project', updatedAt: '2026-09-18T00:00:00.000Z' },
    ]);
  });

  it('keeps the same id when the types differ', () => {
    expect(
      mergeRecentWork(
        [
          [{ id: 'same', title: 'Task', type: 'task', updatedAt: '2026-09-18T00:00:00.000Z' }],
          [{ id: 'same', title: 'Team', type: 'team', updatedAt: '2026-09-17T00:00:00.000Z' }],
        ],
        8,
      ).map((item) => item.type),
    ).toEqual(['task', 'team']);
  });
});

describe('takeRecentByUpdatedAt', () => {
  it('keeps the newest rows up to the per-type cap', () => {
    expect(
      takeRecentByUpdatedAt(
        [
          { id: 'a', updatedAt: '2026-09-01T00:00:00.000Z' },
          { id: 'b', updatedAt: '2026-09-18T00:00:00.000Z' },
          { id: 'c', updatedAt: '2026-09-10T00:00:00.000Z' },
        ],
        2,
      ).map((row) => row.id),
    ).toEqual(['b', 'c']);
  });
});

describe('recentWorkFromSources', () => {
  it('maps ACL rows across task/team/project/savedView without inventing a visit store', () => {
    expect(
      recentWorkFromSources({
        limit: 12,
        perType: 8,
        projects: [{ id: 'p1', name: 'Ship', updatedAt: '2026-09-18T03:00:00.000Z' }],
        savedViews: [{ id: 'v1', name: 'Review', updatedAt: '2026-09-18T02:00:00.000Z' }],
        tasks: [
          {
            id: 't1',
            identifier: 'ENG-1',
            name: '  ',
            updatedAt: '2026-09-18T04:00:00.000Z',
          },
        ],
        teams: [{ id: 'team1', name: 'Eng', updatedAt: '2026-09-18T01:00:00.000Z' }],
      }),
    ).toEqual([
      { id: 't1', title: 'ENG-1', type: 'task', updatedAt: '2026-09-18T04:00:00.000Z' },
      { id: 'p1', title: 'Ship', type: 'project', updatedAt: '2026-09-18T03:00:00.000Z' },
      { id: 'v1', title: 'Review', type: 'savedView', updatedAt: '2026-09-18T02:00:00.000Z' },
      { id: 'team1', title: 'Eng', type: 'team', updatedAt: '2026-09-18T01:00:00.000Z' },
    ]);
  });
});
