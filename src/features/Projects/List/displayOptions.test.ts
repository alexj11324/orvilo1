import { describe, expect, it } from 'vitest';

import enUS from '../../../../locales/en-US/project.json';
import zhCN from '../../../../locales/zh-CN/project.json';
import source from '../../../../packages/locales/src/default/project';
import {
  CLOSED_PROJECT_STATUSES,
  DATA_BACKED_PROJECT_LIST_PROPERTIES,
  DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS,
  defaultDirectionForOrdering,
  filterClosedProjects,
  groupProjectList,
  isDataBackedProjectListProperty,
  nextSortFromHeader,
  normalizeProjectListDisplayOptions,
  pickNextMilestone,
  PROJECT_LIST_GROUPINGS,
  PROJECT_LIST_ORDERINGS,
  PROJECT_LIST_PROPERTIES,
  sortProjectList,
  visibleProjectListColumns,
} from './displayOptions';

const pick = (record: Record<string, string>, key: string) => record[key];

describe('normalizeProjectListDisplayOptions', () => {
  it('returns the defaults for empty or absent input', () => {
    expect(normalizeProjectListDisplayOptions(undefined)).toEqual(
      DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS,
    );
    expect(normalizeProjectListDisplayOptions(null)).toEqual(DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS);
    expect(normalizeProjectListDisplayOptions({})).toEqual(DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS);
  });

  it('falls back per field on unknown persisted values', () => {
    const options = normalizeProjectListDisplayOptions({
      grouping: 'bogus' as never,
      layout: 'board',
      orderBy: 'what' as never,
      orderDirection: 'desc',
      showClosed: 'everything' as never,
    });
    expect(options.layout).toBe('board');
    expect(options.orderDirection).toBe('desc');
    expect(options.grouping).toBe('none');
    expect(options.orderBy).toBe('manual');
    expect(options.showClosed).toBe('all');
  });

  it('persists the timeline layout once the surface exists (T6)', () => {
    expect(normalizeProjectListDisplayOptions({ layout: 'timeline' }).layout).toBe('timeline');
  });

  it('defaults timeline toggles to the reference values and honors persisted ones', () => {
    const defaults = normalizeProjectListDisplayOptions({ layout: 'timeline' });
    expect(defaults.timeline).toEqual({ showProjectList: true, showWeekNumbers: false });
    const custom = normalizeProjectListDisplayOptions({
      timeline: { showProjectList: false, showWeekNumbers: true },
    });
    expect(custom.timeline).toEqual({ showProjectList: false, showWeekNumbers: true });
    // Older snapshots predate the field — partial/junk values fall back per key.
    const partial = normalizeProjectListDisplayOptions({
      timeline: { showWeekNumbers: 'yes' as never },
    });
    expect(partial.timeline.showWeekNumbers).toBe(false);
    expect(partial.timeline.showProjectList).toBe(true);
  });

  it('forces properties with no list-payload data off — never a dead toggle state', () => {
    const options = normalizeProjectListDisplayOptions({
      properties: {
        ...DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS.properties,
        labels: true,
        members: true,
        teams: true,
      },
    });
    expect(options.properties.labels).toBe(false);
    expect(options.properties.members).toBe(false);
    expect(options.properties.teams).toBe(false);
    expect(options.properties.dependencies).toBe(false);
  });

  it('keeps every reference property key in the normalized record', () => {
    const options = normalizeProjectListDisplayOptions(undefined);
    for (const property of PROJECT_LIST_PROPERTIES) {
      expect(typeof options.properties[property], property).toBe('boolean');
    }
  });
});

describe('filterClosedProjects', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const rows = [
    { name: 'open', status: 'active' },
    { completedAt: '2026-09-20T00:00:00Z', name: 'recently closed', status: 'completed' },
    { completedAt: '2026-08-01T00:00:00Z', name: 'old closed', status: 'completed' },
    { name: 'canceled', status: 'canceled', updatedAt: '2026-09-01T00:00:00Z' },
    { archivedAt: '2026-09-22T00:00:00Z', name: 'archived', status: 'archived' },
  ];

  it('keeps everything under all', () => {
    expect(filterClosedProjects(rows, 'all', now)).toHaveLength(rows.length);
  });

  it('hides every closed status under none', () => {
    const visible = filterClosedProjects(rows, 'none', now);
    expect(visible.map((row) => row.name)).toEqual(['open']);
  });

  it('treats completed, canceled and archived as closed', () => {
    for (const status of CLOSED_PROJECT_STATUSES) {
      const visible = filterClosedProjects([{ name: 'x', status }], 'none', now);
      expect(visible, status).toHaveLength(0);
    }
  });

  it('windows closed rows by their close date', () => {
    const week = filterClosedProjects(rows, 'pastWeek', now).map((row) => row.name);
    expect(week).toContain('open');
    expect(week).toContain('recently closed');
    expect(week).toContain('archived');
    expect(week).not.toContain('old closed');
    expect(week).not.toContain('canceled'); // marker (updatedAt) is >7 days old
    const year = filterClosedProjects(rows, 'pastYear', now).map((row) => row.name);
    expect(year).toEqual(rows.map((row) => row.name));
  });
});

describe('sortProjectList', () => {
  const rows = [
    { name: 'beta', priority: 4, status: 'active', targetDate: '2026-10-01' },
    { name: 'alpha', priority: 1, status: 'backlog' },
    { name: 'gamma', priority: 0, status: 'planned', targetDate: '2026-09-30' },
  ];

  it('preserves the incoming order under manual', () => {
    expect(sortProjectList(rows, 'manual', 'desc').map((row) => row.name)).toEqual([
      'beta',
      'alpha',
      'gamma',
    ]);
  });

  it('sorts by name and reverses', () => {
    expect(sortProjectList(rows, 'name', 'asc').map((row) => row.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(sortProjectList(rows, 'name', 'desc').map((row) => row.name)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);
  });

  it('orders priority urgent-first with no-priority last', () => {
    expect(sortProjectList(rows, 'priority', 'asc').map((row) => row.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('orders status by workflow position', () => {
    expect(sortProjectList(rows, 'status', 'asc').map((row) => row.name)).toEqual([
      'alpha', // backlog
      'gamma', // planned
      'beta', // active
    ]);
  });

  it('sinks rows without a date to the end', () => {
    const sorted = sortProjectList(rows, 'targetDate', 'asc').map((row) => row.name);
    expect(sorted[0]).toBe('gamma');
    expect(sorted[1]).toBe('beta');
    expect(sorted[2]).toBe('alpha');
  });
});

describe('nextSortFromHeader', () => {
  it('activates a new field at its natural direction', () => {
    expect(nextSortFromHeader({ orderBy: 'manual', orderDirection: 'asc' }, 'name')).toEqual({
      orderBy: 'name',
      orderDirection: 'asc',
    });
    expect(nextSortFromHeader({ orderBy: 'name', orderDirection: 'asc' }, 'updatedAt')).toEqual({
      orderBy: 'updatedAt',
      orderDirection: 'desc',
    });
  });

  it('flips the direction on a repeat click of the active header', () => {
    expect(nextSortFromHeader({ orderBy: 'name', orderDirection: 'asc' }, 'name')).toEqual({
      orderBy: 'name',
      orderDirection: 'desc',
    });
  });
});

describe('defaultDirectionForOrdering', () => {
  it('defaults date orderings newest-first and the rest ascending', () => {
    expect(defaultDirectionForOrdering('createdAt')).toBe('desc');
    expect(defaultDirectionForOrdering('updatedAt')).toBe('desc');
    expect(defaultDirectionForOrdering('name')).toBe('asc');
    expect(defaultDirectionForOrdering('targetDate')).toBe('asc');
  });
});

describe('groupProjectList', () => {
  const rows = [
    { leadUserId: 'u2', name: 'b', status: 'active' },
    { leadUserId: null, name: 'a', status: 'backlog' },
    { leadUserId: 'u1', name: 'c', status: 'active' },
    { leadUserId: 'u1', name: 'd', status: 'planned' },
  ];

  it('keeps one implicit group under none', () => {
    const groups = groupProjectList(rows, 'none');
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('all');
    expect(groups[0].items).toHaveLength(4);
  });

  it('orders status groups by workflow position', () => {
    expect(groupProjectList(rows, 'status').map((group) => group.key)).toEqual([
      'status:backlog',
      'status:planned',
      'status:active',
    ]);
  });

  it('orders lead groups by resolved name with no-lead last', () => {
    const groups = groupProjectList(rows, 'lead', (userId) => ({ u1: 'Zed', u2: 'Ann' })[userId]);
    expect(groups.map((group) => group.key)).toEqual(['lead:u2', 'lead:u1', 'lead:none']);
    expect(groups[1].items.map((row) => row.name)).toEqual(['c', 'd']);
  });
});

describe('pickNextMilestone', () => {
  const now = new Date('2026-09-23T12:00:00Z');

  it('returns undefined with no milestones', () => {
    expect(pickNextMilestone(undefined, now)).toBeUndefined();
    expect(pickNextMilestone([], now)).toBeUndefined();
  });

  it('picks the earliest upcoming dated milestone', () => {
    const milestone = pickNextMilestone(
      [
        { date: '2026-10-10', name: 'later' },
        { date: '2026-09-30', name: 'next' },
        { date: '2026-09-01', name: 'past' },
      ],
      now,
    );
    expect(milestone?.name).toBe('next');
  });

  it('falls back to the most recent dated milestone when none are upcoming', () => {
    const milestone = pickNextMilestone(
      [
        { date: '2026-09-01', name: 'older' },
        { date: '2026-09-20', name: 'recent' },
      ],
      now,
    );
    expect(milestone?.name).toBe('recent');
  });

  it('falls back to sort order when no milestone is dated', () => {
    const milestone = pickNextMilestone(
      [
        { name: 'second', sortOrder: 1 },
        { name: 'first', sortOrder: 0 },
      ],
      now,
    );
    expect(milestone?.name).toBe('first');
  });
});

describe('visibleProjectListColumns', () => {
  it('reproduces the pre-panel column set under the defaults', () => {
    expect(
      visibleProjectListColumns(DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS.properties).map(
        (column) => column.key,
      ),
    ).toEqual(['health', 'priority', 'lead', 'targetDate', 'issues', 'status']);
  });

  it('adds and removes columns with the property toggles', () => {
    const columns = visibleProjectListColumns({
      ...DEFAULT_PROJECT_LIST_DISPLAY_OPTIONS.properties,
      summary: true,
      status: false,
    }).map((column) => column.key);
    expect(columns).toContain('summary');
    expect(columns).not.toContain('status');
  });
});

describe('display-property coverage', () => {
  it('implements every reference toggle or marks it not-data-backed', () => {
    // The reference lists 17 properties; only the row-model-backed subset may
    // be interactive — the rest must render honest-disabled.
    expect(PROJECT_LIST_PROPERTIES).toHaveLength(17);
    for (const property of PROJECT_LIST_PROPERTIES) {
      expect(typeof isDataBackedProjectListProperty(property)).toBe('boolean');
    }
    expect(DATA_BACKED_PROJECT_LIST_PROPERTIES).not.toContain('labels');
    expect(DATA_BACKED_PROJECT_LIST_PROPERTIES).not.toContain('teams');
    expect(DATA_BACKED_PROJECT_LIST_PROPERTIES).not.toContain('members');
    expect(DATA_BACKED_PROJECT_LIST_PROPERTIES).not.toContain('dependencies');
  });
});

describe('i18n coverage', () => {
  it('defines every display-option key in the source, en-US and zh-CN', () => {
    const keys = [
      'list.display.options',
      'list.display.soon',
      'list.display.timelineSoon',
      'list.display.timelineOptions',
      'list.display.showProjectList',
      'list.display.showWeekNumbers',
      'list.timeline.today',
      'list.timeline.yearJump',
      'list.timeline.setDates',
      'list.display.grouping',
      'list.display.groupingBoardHint',
      'list.display.ordering',
      'list.display.reverseOrder',
      'list.display.showClosed',
      'list.display.listOptions',
      'list.display.properties',
      'list.display.propertyUnavailable',
      'list.display.reset',
      'list.display.setDefault',
      'list.display.setDefaultUnavailable',
      'list.columnStart',
      'list.columnCreated',
      'list.columnCompleted',
      ...PROJECT_LIST_GROUPINGS.map((value) => `list.display.grouping.${value}`),
      ...PROJECT_LIST_ORDERINGS.map((value) => `list.display.ordering.${value}`),
      ...PROJECT_LIST_PROPERTIES.map((value) => `list.display.property.${value}`),
      ...['all', 'pastWeek', 'pastMonth', 'pastYear', 'none'].map(
        (value) => `list.display.closed.${value}`,
      ),
      ...['list', 'board', 'timeline'].map((value) => `list.display.layout.${value}`),
    ];
    for (const key of keys) {
      expect(pick(source as Record<string, string>, key), `source ${key}`).toBeTruthy();
      expect(pick(enUS as Record<string, string>, key), `en-US ${key}`).toBeTruthy();
      expect(pick(zhCN as Record<string, string>, key), `zh-CN ${key}`).toBeTruthy();
    }
  });
});
