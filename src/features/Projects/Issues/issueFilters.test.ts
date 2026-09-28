import { describe, expect, it } from 'vitest';

import enUS from '../../../../locales/en-US/chat.json';
import zhCN from '../../../../locales/zh-CN/chat.json';
import source from '../../../../packages/locales/src/default/chat';
import type { ProjectIssueFilter } from './issueFilters';
import {
  filterProjectIssueList,
  ISSUE_DATE_FIELDS,
  ISSUE_DATE_WINDOWS,
  matchesIssueFilter,
  parseAiIssueFilters,
  parseIssueFilterParam,
  PROJECT_ISSUE_FILTER_GROUPS,
  projectIssuesViewFilterSeed,
  readProjectIssueFilters,
  removeProjectIssueFilter,
  serializeIssueFilterParam,
  upsertProjectIssueFilter,
  writeProjectIssueFilters,
} from './issueFilters';

const pick = (record: Record<string, string>, key: string) => record[key];

const rows = [
  {
    assigneeAgentId: 'agent-1',
    assigneeUserId: 'u1',
    completedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    createdByUserId: 'u2',
    description: 'Billing revamp',
    id: 't1',
    identifier: 'ORV-1',
    labels: [{ id: 'l1' }, { id: 'l2' }],
    name: 'alpha',
    priority: 1,
    status: 'running',
    triageStatus: null,
    updatedAt: '2026-09-22T00:00:00Z',
  },
  {
    assigneeAgentId: null,
    assigneeUserId: null,
    completedAt: '2026-09-20T00:00:00Z',
    createdAt: '2026-08-15T00:00:00Z',
    createdByUserId: null,
    description: null,
    id: 't2',
    identifier: 'ORV-2',
    instruction: 'migrate the schema',
    labels: [],
    name: 'beta',
    priority: null,
    status: 'completed',
    triageStatus: 'untriaged',
    updatedAt: '2026-09-10T00:00:00Z',
  },
  {
    assigneeAgentId: 'agent-2',
    assigneeUserId: 'u2',
    completedAt: null,
    createdAt: '2026-09-20T00:00:00Z',
    createdByUserId: 'u1',
    description: 'search polish',
    id: 't3',
    identifier: 'ORV-3',
    labels: [{ id: 'l2' }],
    name: 'gamma',
    priority: 4,
    status: 'backlog',
    triageStatus: 'accepted',
    updatedAt: '2026-07-01T00:00:00Z',
  },
];

const now = new Date('2026-09-23T12:00:00Z');

describe('filterProjectIssueList', () => {
  it('returns the input untouched with no filters', () => {
    expect(filterProjectIssueList(rows, [], now)).toHaveLength(3);
  });

  it('filters status with OR inside the value set', () => {
    const filtered = filterProjectIssueList(
      rows,
      [{ type: 'status', values: ['running', 'backlog'] }],
      now,
    );
    expect(filtered.map((row) => row.name)).toEqual(['alpha', 'gamma']);
  });

  it('normalizes missing priority to 0 (no priority)', () => {
    const filtered = filterProjectIssueList(rows, [{ type: 'priority', values: [0] }], now);
    expect(filtered.map((row) => row.name)).toEqual(['beta']);
  });

  it('matches assignee and agent including the no-assignee/no-agent choices', () => {
    expect(
      filterProjectIssueList(rows, [{ type: 'assignee', values: ['u1'] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha']);
    expect(
      filterProjectIssueList(rows, [{ type: 'assignee', values: [null] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['beta']);
    expect(
      filterProjectIssueList(rows, [{ type: 'agent', values: ['agent-2'] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['gamma']);
    expect(
      filterProjectIssueList(rows, [{ type: 'agent', values: [null] }], now).map((row) => row.name),
    ).toEqual(['beta']);
  });

  it('matches creator including the no-creator choice', () => {
    expect(
      filterProjectIssueList(rows, [{ type: 'creator', values: ['u2'] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha']);
    expect(
      filterProjectIssueList(rows, [{ type: 'creator', values: [null] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['beta']);
  });

  it('matches labels through the row bindings, including "no labels"', () => {
    expect(
      filterProjectIssueList(rows, [{ type: 'labels', values: ['l1'] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha']);
    // OR within the value set: l2 lives on alpha + gamma.
    expect(
      filterProjectIssueList(rows, [{ type: 'labels', values: ['l2'] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha', 'gamma']);
    expect(
      filterProjectIssueList(rows, [{ type: 'labels', values: [null] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['beta']);
    // A row with no bindings field still answers "no labels" honestly.
    const bare = [{ id: 't9', name: 'bare' }];
    expect(filterProjectIssueList(bare, [{ type: 'labels', values: [null] }], now)).toHaveLength(1);
    expect(filterProjectIssueList(bare, [{ type: 'labels', values: ['l1'] }], now)).toHaveLength(0);
  });

  it('matches triage including the not-in-triage choice', () => {
    expect(
      filterProjectIssueList(rows, [{ type: 'triage', values: ['untriaged'] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['beta']);
    expect(
      filterProjectIssueList(rows, [{ type: 'triage', values: [null] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha']);
    expect(
      filterProjectIssueList(rows, [{ type: 'triage', values: ['accepted', null] }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha', 'gamma']);
  });

  it('windows dates relative to now', () => {
    // created: alpha 09-01, beta 08-15, gamma 09-20 — all before today (the
    // 'past' window ends at today's start), but beta falls outside past30
    // (now − 30d = 08-24).
    expect(
      filterProjectIssueList(rows, [{ field: 'created', type: 'date', window: 'past' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha', 'beta', 'gamma']);
    expect(
      filterProjectIssueList(rows, [{ field: 'created', type: 'date', window: 'past30' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha', 'gamma']);
    // completed: only beta has one
    expect(
      filterProjectIssueList(rows, [{ field: 'completed', type: 'date', window: 'set' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['beta']);
    expect(
      filterProjectIssueList(
        rows,
        [{ field: 'completed', type: 'date', window: 'unset' }],
        now,
      ).map((row) => row.name),
    ).toEqual(['alpha', 'gamma']);
  });

  it('matches text against name, description and instruction', () => {
    expect(
      filterProjectIssueList(rows, [{ query: 'billing', type: 'text' }], now).map(
        (row) => row.name,
      ),
    ).toEqual(['alpha']);
    expect(
      filterProjectIssueList(rows, [{ query: 'SCHEMA', type: 'text' }], now).map((row) => row.name),
    ).toEqual(['beta']);
    expect(
      filterProjectIssueList(rows, [{ query: 'polish', type: 'text' }], now).map((row) => row.name),
    ).toEqual(['gamma']);
  });

  it('ANDs across different filters', () => {
    const filtered = filterProjectIssueList(
      rows,
      [
        { type: 'status', values: ['running', 'backlog'] },
        { type: 'priority', values: [1] },
      ],
      now,
    );
    expect(filtered.map((row) => row.name)).toEqual(['alpha']);
  });

  it('treats an empty status value set as matching nothing', () => {
    expect(matchesIssueFilter(rows[0], { type: 'status', values: [] }, now)).toBe(false);
  });
});

describe('upsert/remove', () => {
  it('replaces the same field instead of stacking', () => {
    const base: ProjectIssueFilter[] = [{ type: 'status', values: ['running'] }];
    const next = upsertProjectIssueFilter(base, { type: 'status', values: ['backlog'] });
    expect(next).toEqual([{ type: 'status', values: ['backlog'] }]);
  });

  it('keeps date filters per-field', () => {
    const base: ProjectIssueFilter[] = [{ field: 'created', type: 'date', window: 'past' }];
    const next = upsertProjectIssueFilter(base, {
      field: 'updated',
      type: 'date',
      window: 'past30',
    });
    expect(next).toHaveLength(2);
    expect(
      upsertProjectIssueFilter(next, { field: 'updated', type: 'date', window: 'set' }),
    ).toEqual([
      { field: 'created', type: 'date', window: 'past' },
      { field: 'updated', type: 'date', window: 'set' },
    ]);
  });

  it('drops the filter when its value set empties', () => {
    const base: ProjectIssueFilter[] = [
      { type: 'status', values: ['running'] },
      { query: 'x', type: 'text' },
    ];
    expect(upsertProjectIssueFilter(base, { type: 'status', values: [] })).toEqual([
      { query: 'x', type: 'text' },
    ]);
    expect(upsertProjectIssueFilter(base, { query: '   ', type: 'text' })).toEqual([
      { type: 'status', values: ['running'] },
    ]);
  });

  it('removes by filter key', () => {
    const base: ProjectIssueFilter[] = [
      { type: 'status', values: ['running'] },
      { field: 'created', type: 'date', window: 'past' },
    ];
    expect(removeProjectIssueFilter(base, 'date.created')).toEqual([
      { type: 'status', values: ['running'] },
    ]);
    expect(removeProjectIssueFilter(base, 'status')).toEqual([
      { field: 'created', type: 'date', window: 'past' },
    ]);
  });
});

describe('URL round-trip', () => {
  it('serializes and parses every filter type', () => {
    const filters: ProjectIssueFilter[] = [
      { type: 'status', values: ['running', 'backlog'] },
      { type: 'priority', values: [1, 4] },
      { type: 'assignee', values: ['u1', null] },
      { type: 'agent', values: ['agent-1'] },
      { type: 'creator', values: [null] },
      { type: 'labels', values: ['l1', null] },
      { type: 'triage', values: ['untriaged', null] },
      { field: 'updated', type: 'date', window: 'past30' },
      { query: 'billing revamp', type: 'text' },
    ];
    const params = writeProjectIssueFilters(new URLSearchParams(), filters);
    expect(readProjectIssueFilters(params)).toEqual(filters);
  });

  it('drops malformed entries and unknown values instead of failing', () => {
    expect(parseIssueFilterParam('status:bogus,running')).toEqual({
      type: 'status',
      values: ['running'],
    });
    expect(parseIssueFilterParam('status:bogus')).toBeUndefined();
    expect(parseIssueFilterParam('nonsense')).toBeUndefined();
    expect(parseIssueFilterParam('date.nope:past')).toBeUndefined();
    expect(parseIssueFilterParam('date.updated:notawindow')).toBeUndefined();
    expect(parseIssueFilterParam('priority:9,1')).toEqual({ type: 'priority', values: [1] });
    expect(parseIssueFilterParam('triage:bogus')).toBeUndefined();
    expect(parseIssueFilterParam('text:')).toBeUndefined();
  });

  it('dedupes repeated params by filter key, first wins', () => {
    const params = new URLSearchParams('filter=status:running&filter=status:backlog');
    expect(readProjectIssueFilters(params)).toEqual([{ type: 'status', values: ['running'] }]);
  });

  it('preserves unrelated params when rewriting filters', () => {
    const params = new URLSearchParams('projectMilestoneId=m1&filter=status:running');
    const next = writeProjectIssueFilters(params, [{ type: 'priority', values: [2] }]);
    expect(next.get('projectMilestoneId')).toBe('m1');
    expect(next.getAll('filter')).toEqual(['priority:2']);
  });

  it('skips empty value sets when serializing', () => {
    expect(serializeIssueFilterParam({ type: 'status', values: [] })).toBeUndefined();
    expect(serializeIssueFilterParam({ query: '  ', type: 'text' })).toBeUndefined();
  });
});

describe('menu composition', () => {
  it('keeps the reference group order with honest support flags', () => {
    expect(PROJECT_ISSUE_FILTER_GROUPS.map((group) => group.id)).toEqual([
      'status',
      'priority',
      'assignee',
      'agent',
      'creator',
      'labels',
      'milestone',
      'dates',
      'triage',
      'text',
      'relations',
      'subscribers',
      'links',
      'template',
    ]);
    const unsupported = PROJECT_ISSUE_FILTER_GROUPS.filter((group) => !group.supported).map(
      (group) => group.id,
    );
    // Groups tasks can't answer must stay disabled — never a dead picker.
    expect(unsupported).toEqual(['relations', 'subscribers', 'links', 'template']);
  });
});

describe('projectIssuesViewFilterSeed', () => {
  it('always leads with the project scope, then every expressible filter', () => {
    const seed = projectIssuesViewFilterSeed('p1', [
      { type: 'status', values: ['running', 'backlog'] },
      { type: 'priority', values: [1, 4] },
      { type: 'assignee', values: ['u1', null] },
      { type: 'labels', values: ['l1'] },
      { type: 'triage', values: ['untriaged'] },
    ]);
    expect(seed).toEqual({
      all: [
        { field: 'projectId', op: 'eq', value: 'p1' },
        { field: 'status', op: 'in', value: ['running', 'backlog'] },
        {
          any: [
            { field: 'priority', op: 'eq', value: 1 },
            { field: 'priority', op: 'eq', value: 4 },
          ],
        },
        {
          any: [
            { field: 'assigneeUserId', op: 'eq', value: 'u1' },
            { field: 'assigneeUserId', op: 'isNull' },
          ],
        },
        { field: 'labelId', op: 'eq', value: 'l1' },
        { field: 'triageStatus', op: 'eq', value: 'untriaged' },
      ],
    });
  });

  it('only emits fields the task work-query registry knows', () => {
    // agent / date / text / null-creator have no task work-query field — they
    // stay URL-only and never leak into a saved view's predicate.
    const seed = projectIssuesViewFilterSeed('p1', [
      { type: 'agent', values: ['agent-1'] },
      { type: 'creator', values: [null] },
      { field: 'created', type: 'date', window: 'past' },
      { query: 'billing', type: 'text' },
    ]);
    expect(seed).toEqual({ all: [{ field: 'projectId', op: 'eq', value: 'p1' }] });
  });

  it('keeps expressible creator values while dropping the null choice', () => {
    const seed = projectIssuesViewFilterSeed('p1', [{ type: 'creator', values: ['u1', null] }]);
    expect(seed).toEqual({
      all: [
        { field: 'projectId', op: 'eq', value: 'p1' },
        { field: 'createdByUserId', op: 'eq', value: 'u1' },
      ],
    });
  });
});

describe('parseAiIssueFilters', () => {
  const members = [
    { name: 'Alex Jiang', userId: 'u1' },
    { name: 'Bert', userId: 'u2' },
  ];
  const agents = [{ id: 'a1', name: 'Orvilo' }];
  const labels = [{ id: 'l1', name: 'Bug' }];

  it('parses status and priority phrases', () => {
    expect(parseAiIssueFilters('urgent issues in progress')).toEqual([
      { type: 'status', values: ['running'] },
      { type: 'priority', values: [1] },
    ]);
    expect(parseAiIssueFilters('completed or canceled')).toEqual([
      { type: 'status', values: ['completed', 'canceled'] },
    ]);
  });

  it('parses zh-CN phrases', () => {
    expect(parseAiIssueFilters('待分类的紧急任务')).toEqual([
      { type: 'priority', values: [1] },
      { type: 'triage', values: ['untriaged'] },
    ]);
    expect(parseAiIssueFilters('进行中')).toEqual([{ type: 'status', values: ['running'] }]);
  });

  it('parses date phrases', () => {
    expect(parseAiIssueFilters('recently updated')).toEqual([
      { field: 'updated', type: 'date', window: 'past30' },
    ]);
    expect(parseAiIssueFilters('unfinished')).toEqual([
      { field: 'completed', type: 'date', window: 'unset' },
    ]);
  });

  it('resolves me, member and agent names', () => {
    expect(parseAiIssueFilters('assigned to me', { currentUserId: 'u9' })).toEqual([
      { type: 'assignee', values: ['u9'] },
    ]);
    expect(parseAiIssueFilters('unassigned')).toEqual([{ type: 'assignee', values: [null] }]);
    expect(parseAiIssueFilters('created by Bert', { members })).toEqual([
      { type: 'creator', values: ['u2'] },
    ]);
    // Bare member name defaults to assignee on an issues list.
    expect(parseAiIssueFilters('Alex Jiang', { members })).toEqual([
      { type: 'assignee', values: ['u1'] },
    ]);
    expect(parseAiIssueFilters('assigned to Orvilo', { agents })).toEqual([
      { type: 'agent', values: ['a1'] },
    ]);
  });

  it('resolves label names and the unlabeled phrase', () => {
    expect(parseAiIssueFilters('labeled Bug', { labels })).toEqual([
      { type: 'labels', values: ['l1'] },
    ]);
    expect(parseAiIssueFilters('unlabeled')).toEqual([{ type: 'labels', values: [null] }]);
  });

  it('degrades unrecognised text to an honest title/description contains', () => {
    expect(parseAiIssueFilters('xyzzy plugh')).toEqual([{ type: 'text', query: 'xyzzy plugh' }]);
    expect(parseAiIssueFilters('   ')).toEqual([]);
  });

  it('does not let ascii phrases fire inside other words', () => {
    // "done" must not match inside "abandoned"; "low" inside "below" neither.
    expect(parseAiIssueFilters('abandoned below', { members: [] })).toEqual([
      { type: 'text', query: 'abandoned below' },
    ]);
  });
});

describe('i18n coverage', () => {
  it('defines every filter key in the source, en-US and zh-CN', () => {
    const keys = [
      'taskList.filter.add',
      'taskList.filter.advanced',
      'taskList.filter.ai',
      'taskList.filter.aiHint',
      'taskList.filter.aiNoMatch',
      'taskList.filter.aiPlaceholder',
      'taskList.filter.anyMilestone',
      'taskList.filter.apply',
      'taskList.filter.back',
      'taskList.filter.clearAll',
      'taskList.filter.loading',
      'taskList.filter.membersError',
      'taskList.filter.noAgent',
      'taskList.filter.noAssignee',
      'taskList.filter.noCreator',
      'taskList.filter.noLabels',
      'taskList.filter.noLabelsDefined',
      'taskList.filter.noMatches',
      'taskList.filter.noMenuMatches',
      'taskList.filter.notInTriage',
      'taskList.filter.removeChip',
      'taskList.filter.searchMembers',
      'taskList.filter.searchPlaceholder',
      'taskList.filter.textPlaceholder',
      'taskList.filter.unavailable',
      'taskList.detail.close',
      'taskList.detail.openFullPage',
      'taskList.details.close',
      'taskList.details.open',
      'taskList.details.selectIssue',
      ...PROJECT_ISSUE_FILTER_GROUPS.map((group) => `taskList.filter.groups.${group.id}`),
      ...ISSUE_DATE_FIELDS.map((field) => `taskList.filter.dateFields.${field}`),
      ...ISSUE_DATE_WINDOWS.map((window) => `taskList.filter.windows.${window}`),
    ];
    for (const key of keys) {
      expect(pick(source as Record<string, string>, key), `source ${key}`).toBeTruthy();
      expect(pick(enUS as Record<string, string>, key), `en-US ${key}`).toBeTruthy();
      expect(pick(zhCN as Record<string, string>, key), `zh-CN ${key}`).toBeTruthy();
    }
  });
});
