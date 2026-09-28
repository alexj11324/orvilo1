import { describe, expect, it } from 'vitest';

import enUS from '../../../../locales/en-US/project.json';
import zhCN from '../../../../locales/zh-CN/project.json';
import source from '../../../../packages/locales/src/default/project';
import {
  filterProjectList,
  parseAiProjectFilters,
  parseProjectListFilter,
  PROJECT_LIST_DATE_FIELDS,
  PROJECT_LIST_DATE_WINDOWS,
  PROJECT_LIST_FILTER_GROUPS,
  type ProjectListFilter,
  readProjectListFilters,
  removeProjectListFilter,
  upsertProjectListFilter,
  writeProjectListFilters,
} from './listFilters';

const pick = (record: Record<string, string>, key: string) => record[key];

const rows = [
  {
    health: 'onTrack',
    id: 'p1',
    leadUserId: 'u1',
    name: 'alpha',
    priority: 1,
    status: 'active',
    summary: 'Billing revamp',
    targetDate: '2026-09-30',
    userId: 'u2',
  },
  {
    health: 'atRisk',
    id: 'p2',
    leadUserId: null,
    name: 'beta',
    priority: 4,
    status: 'planned',
    summary: null,
    targetDate: '2026-11-01',
    updatedAt: '2026-09-10T00:00:00Z',
    userId: 'u1',
  },
  {
    health: null,
    id: 'p3',
    leadUserId: 'u2',
    name: 'gamma',
    priority: 0,
    status: 'completed',
    summary: 'Migration',
    targetDate: '2026-08-01',
    userId: null,
  },
];

const now = new Date('2026-09-23T12:00:00Z');

describe('filterProjectList', () => {
  it('returns the input untouched with no filters', () => {
    expect(filterProjectList(rows, [], now)).toHaveLength(3);
  });

  it('filters status with OR inside the value set', () => {
    const filtered = filterProjectList(
      rows,
      [{ type: 'status', values: ['active', 'planned'] }],
      now,
    );
    expect(filtered.map((row) => row.name)).toEqual(['alpha', 'beta']);
  });

  it('normalizes missing priority to 0 (no priority)', () => {
    const filtered = filterProjectList(rows, [{ type: 'priority', values: [0] }], now);
    expect(filtered.map((row) => row.name)).toEqual(['gamma']);
  });

  it('matches lead including the no-lead choice', () => {
    expect(
      filterProjectList(rows, [{ type: 'lead', values: ['u1'] }], now).map((row) => row.name),
    ).toEqual(['alpha']);
    expect(
      filterProjectList(rows, [{ type: 'lead', values: [null] }], now).map((row) => row.name),
    ).toEqual(['beta']);
    expect(
      filterProjectList(rows, [{ type: 'lead', values: ['u1', null] }], now).map((row) => row.name),
    ).toEqual(['alpha', 'beta']);
  });

  it('matches creator including the no-creator choice', () => {
    expect(
      filterProjectList(rows, [{ type: 'creator', values: ['u1'] }], now).map((row) => row.name),
    ).toEqual(['beta']);
    expect(
      filterProjectList(rows, [{ type: 'creator', values: [null] }], now).map((row) => row.name),
    ).toEqual(['gamma']);
  });

  it('matches health including the no-updates choice', () => {
    expect(
      filterProjectList(rows, [{ type: 'health', values: [null] }], now).map((row) => row.name),
    ).toEqual(['gamma']);
    expect(
      filterProjectList(rows, [{ type: 'health', values: ['atRisk'] }], now).map((row) => row.name),
    ).toEqual(['beta']);
  });

  it('windows dates relative to now', () => {
    // targetDate: alpha 09-30 (within 7d), beta 11-01 (within 90d, not 30d), gamma 08-01 (past)
    expect(
      filterProjectList(rows, [{ field: 'targetDate', type: 'date', window: 'past' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['gamma']);
    expect(
      filterProjectList(rows, [{ field: 'targetDate', type: 'date', window: 'next7' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha']);
    expect(
      filterProjectList(rows, [{ field: 'targetDate', type: 'date', window: 'next30' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha']);
    expect(
      filterProjectList(rows, [{ field: 'targetDate', type: 'date', window: 'next90' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha', 'beta']);
  });

  it('supports set/unset date predicates', () => {
    expect(
      filterProjectList(rows, [{ field: 'updated', type: 'date', window: 'unset' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha', 'gamma']);
    expect(
      filterProjectList(rows, [{ field: 'updated', type: 'date', window: 'set' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['beta']);
  });

  it('matches text against name and summary only', () => {
    expect(
      filterProjectList(rows, [{ query: 'billing', type: 'text' }], now).map((row) => row.name),
    ).toEqual(['alpha']);
    expect(
      filterProjectList(rows, [{ query: 'ALPHA', type: 'text' }], now).map((row) => row.name),
    ).toEqual(['alpha']);
  });

  it('narrows to specific project ids', () => {
    expect(
      filterProjectList(rows, [{ ids: ['p1', 'p3'], type: 'projects' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha', 'gamma']);
  });

  it('ANDs across different filters', () => {
    const filtered = filterProjectList(
      rows,
      [
        { type: 'status', values: ['active', 'planned'] },
        { type: 'priority', values: [1] },
      ],
      now,
    );
    expect(filtered.map((row) => row.name)).toEqual(['alpha']);
  });
});

describe('upsert/remove', () => {
  it('replaces the same field instead of stacking', () => {
    const base: ProjectListFilter[] = [{ type: 'status', values: ['active'] }];
    const next = upsertProjectListFilter(base, { type: 'status', values: ['planned'] });
    expect(next).toEqual([{ type: 'status', values: ['planned'] }]);
  });

  it('keeps date filters per-field', () => {
    const base: ProjectListFilter[] = [{ field: 'targetDate', type: 'date', window: 'next7' }];
    const next = upsertProjectListFilter(base, {
      field: 'created',
      type: 'date',
      window: 'past30',
    });
    expect(next).toHaveLength(2);
    expect(
      upsertProjectListFilter(next, { field: 'created', type: 'date', window: 'set' }),
    ).toEqual([
      { field: 'targetDate', type: 'date', window: 'next7' },
      { field: 'created', type: 'date', window: 'set' },
    ]);
  });

  it('drops the filter when its value set empties', () => {
    const base: ProjectListFilter[] = [
      { type: 'status', values: ['active'] },
      { query: 'x', type: 'text' },
    ];
    expect(upsertProjectListFilter(base, { type: 'status', values: [] })).toEqual([
      { query: 'x', type: 'text' },
    ]);
    expect(upsertProjectListFilter(base, { query: '   ', type: 'text' })).toEqual([
      { type: 'status', values: ['active'] },
    ]);
  });

  it('removes by filter key', () => {
    const base: ProjectListFilter[] = [
      { type: 'status', values: ['active'] },
      { field: 'targetDate', type: 'date', window: 'past' },
    ];
    expect(removeProjectListFilter(base, 'date.targetDate')).toEqual([
      { type: 'status', values: ['active'] },
    ]);
  });
});

describe('URL round-trip', () => {
  it('serializes and parses every filter type', () => {
    const filters: ProjectListFilter[] = [
      { type: 'status', values: ['active', 'paused'] },
      { type: 'priority', values: [1, 4] },
      { type: 'lead', values: ['u1', null] },
      { type: 'creator', values: [null] },
      { type: 'health', values: ['onTrack', null] },
      { field: 'targetDate', type: 'date', window: 'next30' },
      { query: 'billing revamp', type: 'text' },
      { ids: ['p1', 'p2'], type: 'projects' },
    ];
    const params = writeProjectListFilters(new URLSearchParams(), filters);
    expect(readProjectListFilters(params)).toEqual(filters);
  });

  it('drops malformed entries and unknown values instead of failing', () => {
    expect(parseProjectListFilter('status:bogus,active')).toEqual({
      type: 'status',
      values: ['active'],
    });
    expect(parseProjectListFilter('status:bogus')).toBeUndefined();
    expect(parseProjectListFilter('nonsense')).toBeUndefined();
    expect(parseProjectListFilter('date.nope:next7')).toBeUndefined();
    expect(parseProjectListFilter('date.targetDate:notawindow')).toBeUndefined();
    expect(parseProjectListFilter('priority:9,1')).toEqual({ type: 'priority', values: [1] });
    expect(parseProjectListFilter('text:')).toBeUndefined();
  });

  it('dedupes repeated params by filter key, first wins', () => {
    const params = new URLSearchParams('filter=status:active&filter=status:planned');
    expect(readProjectListFilters(params)).toEqual([{ type: 'status', values: ['active'] }]);
  });

  it('preserves unrelated params when rewriting filters', () => {
    const params = new URLSearchParams('tab=all&filter=status:active');
    const next = writeProjectListFilters(params, [{ type: 'priority', values: [2] }]);
    expect(next.get('tab')).toBe('all');
    expect(next.getAll('filter')).toEqual(['priority:2']);
  });
});

describe('menu composition', () => {
  it('keeps the reference group order with honest support flags', () => {
    expect(PROJECT_LIST_FILTER_GROUPS.map((group) => group.id)).toEqual([
      'status',
      'priority',
      'labels',
      'teams',
      'lead',
      'members',
      'creator',
      'health',
      'dates',
      'milestones',
      'relations',
      'template',
      'text',
      'projects',
    ]);
    const unsupported = PROJECT_LIST_FILTER_GROUPS.filter((group) => !group.supported).map(
      (group) => group.id,
    );
    // Groups with no list-payload data must stay disabled — never a dead picker.
    expect(unsupported).toEqual([
      'labels',
      'teams',
      'members',
      'milestones',
      'relations',
      'template',
    ]);
  });
});

describe('parseAiProjectFilters', () => {
  const members = [
    { name: 'Alex Jiang', userId: 'u1' },
    { name: 'Bert', userId: 'u2' },
  ];

  it('parses status, priority and health phrases', () => {
    expect(parseAiProjectFilters('active urgent projects')).toEqual([
      { type: 'status', values: ['active'] },
      { type: 'priority', values: [1] },
    ]);
    expect(parseAiProjectFilters('at risk projects')).toEqual([
      { type: 'health', values: ['atRisk'] },
    ]);
    expect(parseAiProjectFilters('completed or canceled')).toEqual([
      { type: 'status', values: ['completed', 'canceled'] },
    ]);
  });

  it('parses zh-CN phrases', () => {
    expect(parseAiProjectFilters('已暂停的项目')).toEqual([{ type: 'status', values: ['paused'] }]);
    expect(parseAiProjectFilters('有风险')).toEqual([{ type: 'health', values: ['atRisk'] }]);
  });

  it('parses date phrases', () => {
    expect(parseAiProjectFilters('overdue')).toEqual([
      { field: 'targetDate', type: 'date', window: 'past' },
    ]);
    expect(parseAiProjectFilters('due this week')).toEqual([
      { field: 'targetDate', type: 'date', window: 'next7' },
    ]);
    expect(parseAiProjectFilters('no target date')).toEqual([
      { field: 'targetDate', type: 'date', window: 'unset' },
    ]);
  });

  it('resolves me and member names', () => {
    expect(parseAiProjectFilters('led by me', { currentUserId: 'u9', members })).toEqual([
      { type: 'lead', values: ['u9'] },
    ]);
    expect(parseAiProjectFilters('no lead')).toEqual([{ type: 'lead', values: [null] }]);
    expect(parseAiProjectFilters('created by Bert', { members })).toEqual([
      { type: 'creator', values: ['u2'] },
    ]);
    // Bare member name defaults to lead on a projects list.
    expect(parseAiProjectFilters('Alex Jiang', { members })).toEqual([
      { type: 'lead', values: ['u1'] },
    ]);
  });

  it('returns nothing for unrecognizable input — never a fake filter', () => {
    expect(parseAiProjectFilters('xyzzy plugh')).toEqual([]);
    expect(parseAiProjectFilters('   ')).toEqual([]);
  });

  it('does not let ascii phrases fire inside other words', () => {
    // "done" must not match inside "abandoned"; "low" inside "below" neither.
    expect(parseAiProjectFilters('abandoned below', { members: [] })).toEqual([]);
  });
});

describe('i18n coverage', () => {
  it('defines every filter key in the source, en-US and zh-CN', () => {
    const keys = [
      'list.filter.add',
      'list.filter.advanced',
      'list.filter.ai',
      'list.filter.aiHint',
      'list.filter.aiNoMatch',
      'list.filter.aiPlaceholder',
      'list.filter.apply',
      'list.filter.back',
      'list.filter.clearAll',
      'list.filter.membersError',
      'list.filter.noCreator',
      'list.filter.noMenuMatches',
      'list.filter.noResults',
      'list.filter.removeChip',
      'list.filter.searchMembers',
      'list.filter.searchPlaceholder',
      'list.filter.textPlaceholder',
      'list.filter.unavailable',
      'list.toolbarControls',
      ...PROJECT_LIST_FILTER_GROUPS.map((group) => `list.filter.group.${group.id}`),
      ...PROJECT_LIST_DATE_FIELDS.map((field) => `list.filter.dateField.${field}`),
      ...PROJECT_LIST_DATE_WINDOWS.map((window) => `list.filter.window.${window}`),
    ];
    for (const key of keys) {
      expect(pick(source as Record<string, string>, key), `source ${key}`).toBeTruthy();
      expect(pick(enUS as Record<string, string>, key), `en-US ${key}`).toBeTruthy();
      expect(pick(zhCN as Record<string, string>, key), `zh-CN ${key}`).toBeTruthy();
    }
  });
});
