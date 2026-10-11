import { describe, expect, it } from 'vitest';

import {
  acceptancePolicyChanged,
  activityLogPropertyChange,
  collectActivityIssueIds,
  type ReadableIssueRefs,
} from './activityLogChange';

const issues: ReadableIssueRefs = new Map([
  ['task_a', { identifier: 'ENG-1', name: 'Readable' }],
  ['task_b', { identifier: 'ENG-2', name: null }],
]);

describe('activityLogPropertyChange', () => {
  it('names a workflow move by the team state where one was recorded, else by category', () => {
    expect(
      activityLogPropertyChange(
        {
          payload: { from: 'in_progress', fromLabel: 'Doing', to: 'in_review', toLabel: null },
          type: 'workflow_state',
        },
        issues,
      ),
    ).toEqual({
      field: 'workflow',
      from: { category: 'in_progress', name: 'Doing' },
      to: { category: 'in_review', name: null },
    });
  });

  it('keeps the legacy status, priority and automation rows as they were', () => {
    expect(
      activityLogPropertyChange(
        { payload: { from: 'backlog', to: 'paused' }, type: 'status' },
        issues,
      ),
    ).toEqual({ field: 'status', from: 'backlog', to: 'paused' });
    expect(
      activityLogPropertyChange({ payload: { from: 0, to: 2 }, type: 'priority' }, issues),
    ).toEqual({ field: 'priority', from: 0, to: 2 });
  });

  it('describes a relation from the side of the Issue whose feed it is in', () => {
    expect(
      activityLogPropertyChange(
        { payload: { relation: 'blocking', toId: 'task_a' }, type: 'relation_removed' },
        issues,
      ),
    ).toEqual({
      action: 'removed',
      field: 'relation',
      relation: 'blocking',
      target: { identifier: 'ENG-1', name: 'Readable' },
    });
  });

  it('never names an Issue the reader cannot be shown, and never turns it into "none"', () => {
    expect(
      activityLogPropertyChange(
        { payload: { fromId: 'task_a', toId: 'task_hidden' }, type: 'parent' },
        issues,
      ),
    ).toEqual({
      field: 'parent',
      from: { identifier: 'ENG-1', name: 'Readable' },
      to: { unavailable: true },
    });
    expect(
      activityLogPropertyChange(
        { payload: { fromId: 'task_b', toId: null }, type: 'duplicate' },
        issues,
      ),
    ).toEqual({ field: 'duplicate', from: { identifier: 'ENG-2', name: null }, to: null });
  });

  it('tells a cleared project apart from one whose name was lost', () => {
    expect(
      activityLogPropertyChange(
        { payload: { fromId: 'p1', fromLabel: 'Alpha', toId: null }, type: 'project' },
        issues,
      ),
    ).toEqual({ field: 'project', from: 'Alpha', to: null });
    expect(
      activityLogPropertyChange({ payload: { fromId: 'p1', toId: 'p2' }, type: 'project' }, issues),
    ).toEqual({ field: 'project', from: '', to: '' });
  });

  it('maps labels, links, sub-issues, due dates, titles and valueless edits', () => {
    expect(
      activityLogPropertyChange({ payload: { toLabel: 'bug' }, type: 'label_added' }, issues),
    ).toEqual({ action: 'added', field: 'label', name: 'bug' });
    expect(
      activityLogPropertyChange(
        {
          payload: { resourceKind: 'pull_request', toLabel: 'Fix', url: 'https://x.test/1' },
          type: 'resource_removed',
        },
        issues,
      ),
    ).toEqual({
      action: 'removed',
      field: 'resource',
      kind: 'pull_request',
      title: 'Fix',
      url: 'https://x.test/1',
    });
    expect(
      activityLogPropertyChange({ payload: { toId: 'task_a' }, type: 'sub_issue_added' }, issues),
    ).toMatchObject({ action: 'added', field: 'relation', relation: 'sub_issue' });
    expect(
      activityLogPropertyChange(
        { payload: { from: null, to: '2026-08-15' }, type: 'due_date' },
        issues,
      ),
    ).toEqual({ field: 'dueDate', from: null, to: '2026-08-15' });
    expect(
      activityLogPropertyChange({ payload: { from: 'Old', to: 'New' }, type: 'title' }, issues),
    ).toEqual({ field: 'title', from: 'Old', to: 'New' });
    expect(activityLogPropertyChange({ payload: {}, type: 'description' }, issues)).toEqual({
      field: 'description',
    });
    expect(activityLogPropertyChange({ payload: null, type: 'verify_config' }, issues)).toEqual({
      field: 'verify',
    });
  });

  it('leaves the assignee slots and unknown kinds to their own handling', () => {
    expect(
      activityLogPropertyChange({ payload: { toId: 'u1' }, type: 'assignee_user' }, issues),
    ).toBeNull();
    expect(
      activityLogPropertyChange({ payload: {}, type: 'from_the_future' as never }, issues),
    ).toBeNull();
  });
});

describe('collectActivityIssueIds', () => {
  it('collects only ids that name other Issues, once each', () => {
    expect(
      collectActivityIssueIds([
        { payload: { fromId: 'task_a', toId: 'task_b' }, type: 'parent' },
        { payload: { toId: 'task_b' }, type: 'relation_added' },
        { payload: { fromId: 'user_1', toId: 'user_2' }, type: 'assignee_user' },
        { payload: { fromId: 'state_1', toId: 'state_2' }, type: 'workflow_state' },
      ]),
    ).toEqual(['task_a', 'task_b']);
  });
});

describe('acceptancePolicyChanged', () => {
  it('is false when the policy is saved untouched', () => {
    expect(
      acceptancePolicyChanged(
        { config: { enabled: true, maxIterations: 3 }, requirement: 'Ship it' },
        { config: { enabled: true, maxIterations: 3 }, requirement: 'Ship it' },
      ),
    ).toBe(false);
    expect(acceptancePolicyChanged({ config: null }, { config: {}, requirement: undefined })).toBe(
      false,
    );
  });

  it('is true when the requirement or any setting changed', () => {
    expect(
      acceptancePolicyChanged({ config: {}, requirement: 'A' }, { config: {}, requirement: 'B' }),
    ).toBe(true);
    expect(
      acceptancePolicyChanged({ config: { enabled: true } }, { config: { enabled: false } }),
    ).toBe(true);
  });
});
