import { describe, expect, it } from 'vitest';

import { formatActivityDate, resolvePropertyActivityCopy } from './propertyActivityCopy';

describe('resolvePropertyActivityCopy', () => {
  it('names a workflow move by the team state, falling back to the category label', () => {
    expect(
      resolvePropertyActivityCopy({
        field: 'workflow',
        from: { category: 'in_progress', name: 'Doing' },
        to: { category: 'in_review', name: null },
      }),
    ).toEqual({
      key: 'taskDetail.activities.status.changed',
      slots: {
        from: { kind: 'text', text: 'Doing' },
        to: { key: 'taskDetail.workflow.category.in_review', kind: 'label' },
      },
    });
  });

  it('uses the "set" sentence when a workflow row has no starting state', () => {
    expect(
      resolvePropertyActivityCopy({ field: 'workflow', from: null, to: { category: 'todo' } }),
    ).toEqual({
      key: 'taskDetail.activities.workflow.set',
      slots: { to: { key: 'taskDetail.workflow.category.todo', kind: 'label' } },
    });
  });

  it('picks set / changed / removed from which sides of the change exist', () => {
    expect(resolvePropertyActivityCopy({ field: 'dueDate', from: null, to: '2026-08-15' })).toEqual(
      {
        key: 'taskDetail.activities.dueDate.set',
        slots: { to: { kind: 'text', text: '2026/08/15' } },
      },
    );
    expect(
      resolvePropertyActivityCopy({ field: 'dueDate', from: '2026-08-15', to: '2026-09-01' })?.key,
    ).toBe('taskDetail.activities.dueDate.changed');
    expect(resolvePropertyActivityCopy({ field: 'dueDate', from: '2026-08-15', to: null })).toEqual(
      {
        key: 'taskDetail.activities.dueDate.removed',
        slots: {
          from: { kind: 'text', text: '2026/08/15' },
        },
      },
    );
    expect(resolvePropertyActivityCopy({ field: 'dueDate', from: null, to: null })).toBeNull();
  });

  it('words each relation from the side of the Issue the feed belongs to', () => {
    const target = { identifier: 'ENG-2', name: 'Other' };
    const key = (relation: 'blocked_by' | 'blocking' | 'related' | 'sub_issue') =>
      resolvePropertyActivityCopy({ action: 'added', field: 'relation', relation, target })?.key;

    expect(key('blocked_by')).toBe('taskDetail.activities.relation.blockedBy.added');
    expect(key('blocking')).toBe('taskDetail.activities.relation.blocking.added');
    expect(key('related')).toBe('taskDetail.activities.relation.related.added');
    expect(key('sub_issue')).toBe('taskDetail.activities.subIssue.added');
    expect(
      resolvePropertyActivityCopy({
        action: 'removed',
        field: 'relation',
        relation: 'blocked_by',
        target: { unavailable: true },
      }),
    ).toEqual({
      key: 'taskDetail.activities.relation.blockedBy.removed',
      slots: { target: { kind: 'issue', ref: { unavailable: true } } },
    });
  });

  it('distinguishes a parent that was set, changed and removed', () => {
    const a = { identifier: 'ENG-1' };
    const b = { identifier: 'ENG-2' };
    expect(resolvePropertyActivityCopy({ field: 'parent', from: null, to: a })?.key).toBe(
      'taskDetail.activities.parent.set',
    );
    expect(resolvePropertyActivityCopy({ field: 'parent', from: a, to: b })?.key).toBe(
      'taskDetail.activities.parent.changed',
    );
    expect(resolvePropertyActivityCopy({ field: 'parent', from: a, to: null })).toEqual({
      key: 'taskDetail.activities.parent.removed',
      slots: { from: { kind: 'issue', ref: a } },
    });
  });

  it('marks and clears a duplicate', () => {
    expect(
      resolvePropertyActivityCopy({ field: 'duplicate', from: null, to: { identifier: 'ENG-9' } }),
    ).toEqual({
      key: 'taskDetail.activities.duplicate.set',
      slots: { target: { kind: 'issue', ref: { identifier: 'ENG-9' } } },
    });
    expect(
      resolvePropertyActivityCopy({ field: 'duplicate', from: { identifier: 'ENG-9' }, to: null })
        ?.key,
    ).toBe('taskDetail.activities.duplicate.cleared');
  });

  it('falls back to a "deleted" name when a project, milestone, team or label name was lost', () => {
    expect(resolvePropertyActivityCopy({ field: 'project', from: '', to: 'Beta' })).toEqual({
      key: 'taskDetail.activities.project.changed',
      slots: {
        from: { key: 'taskDetail.activities.unavailable.project', kind: 'label' },
        to: { kind: 'text', text: 'Beta' },
      },
    });
    expect(resolvePropertyActivityCopy({ field: 'team', from: 'Core', to: null })?.key).toBe(
      'taskDetail.activities.team.removed',
    );
    expect(resolvePropertyActivityCopy({ field: 'milestone', from: null, to: 'M1' })?.key).toBe(
      'taskDetail.activities.milestone.set',
    );
    expect(resolvePropertyActivityCopy({ action: 'removed', field: 'label', name: null })).toEqual({
      key: 'taskDetail.activities.label.removed',
      slots: { label: { key: 'taskDetail.activities.unavailable.label', kind: 'label' } },
    });
  });

  it('tells a pull request from a plain link', () => {
    const base = {
      action: 'added',
      field: 'resource',
      title: 'Fix',
      url: 'https://x.test',
    } as const;
    expect(resolvePropertyActivityCopy({ ...base, kind: 'pull_request' })?.key).toBe(
      'taskDetail.activities.resource.pullRequest.added',
    );
    expect(resolvePropertyActivityCopy({ ...base, kind: 'link' })).toEqual({
      key: 'taskDetail.activities.resource.link.added',
      slots: { link: { kind: 'link', title: 'Fix', url: 'https://x.test' } },
    });
  });

  it('has a sentence for valueless edits and an untitled title', () => {
    expect(resolvePropertyActivityCopy({ field: 'description' })?.key).toBe(
      'taskDetail.activities.description.edited',
    );
    expect(resolvePropertyActivityCopy({ field: 'title', from: null, to: 'New' })).toEqual({
      key: 'taskDetail.activities.title.changed',
      slots: {
        from: { key: 'taskDetail.activities.unavailable.title', kind: 'label' },
        to: { kind: 'text', text: 'New' },
      },
    });
  });
});

describe('formatActivityDate', () => {
  it('writes absolute dates as YYYY/MM/DD and leaves anything else alone', () => {
    expect(formatActivityDate('2026-08-15')).toBe('2026/08/15');
    expect(formatActivityDate('2026-08-15T00:00:00.000Z')).toBe('2026/08/15');
    expect(formatActivityDate('soon')).toBe('soon');
  });
});
