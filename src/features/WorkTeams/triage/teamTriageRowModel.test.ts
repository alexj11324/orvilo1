import { describe, expect, it } from 'vitest';

import {
  buildTriageMutationInput,
  resolveTriageCreator,
  TEAM_TRIAGE_SNOOZE_ENABLED,
  triageAgeLabel,
  triageAssigneeOptions,
} from './teamTriageRowModel';

describe('buildTriageMutationInput', () => {
  const task = { domainRevision: 7, id: 'task-1' };

  it('maps accept/decline onto the triage mutation with the revision guard', () => {
    expect(buildTriageMutationInput(task, 'team-1', 'accept')).toEqual({
      action: 'accept',
      expectedDomainRevision: 7,
      taskId: 'task-1',
      teamId: 'team-1',
    });
    expect(buildTriageMutationInput(task, 'team-1', 'decline')?.action).toBe('decline');
  });

  it('refuses rows without a domainRevision — a write there would skip CAS', () => {
    expect(buildTriageMutationInput({ id: 'task-1' }, 'team-1', 'accept')).toBeNull();
  });

  it('requires the extra ids reassign and duplicate depend on', () => {
    expect(buildTriageMutationInput(task, 'team-1', 'reassign')).toBeNull();
    expect(
      buildTriageMutationInput(task, 'team-1', 'reassign', { assigneeUserId: 'user-9' }),
    ).toMatchObject({ action: 'reassign', assigneeUserId: 'user-9' });
    expect(buildTriageMutationInput(task, 'team-1', 'duplicate')).toBeNull();
    expect(
      buildTriageMutationInput(task, 'team-1', 'duplicate', { canonicalTaskId: 'task-9' }),
    ).toMatchObject({ action: 'duplicate', canonicalTaskId: 'task-9' });
  });
});

describe('resolveTriageCreator', () => {
  const profiles = new Map([['user-1', { avatar: 'https://img/a.png', name: 'Ada' }]]);

  it('prefers the workspace profile so the avatar image renders', () => {
    expect(
      resolveTriageCreator(
        {
          createdBySnapshot: { displayName: 'Snapshot Name', kind: 'user' },
          createdByUserId: 'user-1',
        },
        profiles,
      ),
    ).toEqual({ avatar: 'https://img/a.png', name: 'Ada' });
  });

  it('falls back to the creation snapshot for creators outside the directory', () => {
    expect(
      resolveTriageCreator(
        {
          createdBySnapshot: { displayName: 'Linear Bot', kind: 'integration' },
          createdByUserId: 'ghost',
        },
        profiles,
      ),
    ).toEqual({ avatar: null, name: 'Linear Bot' });
  });

  it('returns undefined when neither source has anything to show', () => {
    expect(resolveTriageCreator({}, profiles)).toBeUndefined();
    expect(
      resolveTriageCreator({ createdByUserId: 'user-2' }, new Map([['user-2', {}]])),
    ).toBeUndefined();
  });
});

describe('triageAssigneeOptions', () => {
  const profiles = new Map([
    ['user-1', { name: 'Ada' }],
    ['user-2', { name: null }],
  ]);

  it('labels members with directory names and drops the current assignee', () => {
    expect(
      triageAssigneeOptions([{ userId: 'user-1' }, { userId: 'user-2' }], profiles, 'user-1'),
    ).toEqual([{ label: 'user-2', value: 'user-2' }]);
  });

  it('keeps every member when nobody is assigned', () => {
    expect(
      triageAssigneeOptions([{ userId: 'user-1' }, { userId: 'user-2' }], profiles, null),
    ).toEqual([
      { label: 'Ada', value: 'user-1' },
      { label: 'user-2', value: 'user-2' },
    ]);
  });
});

describe('triageAgeLabel', () => {
  const now = '2026-09-23T12:00:00Z';

  it('compacts minutes through years into Linear-style units', () => {
    expect(triageAgeLabel('2026-09-23T11:40:00Z', now)).toBe('20m');
    expect(triageAgeLabel('2026-09-23T05:00:00Z', now)).toBe('7h');
    expect(triageAgeLabel('2026-09-21T12:00:00Z', now)).toBe('2d');
    expect(triageAgeLabel('2026-09-09T12:00:00Z', now)).toBe('2w');
    expect(triageAgeLabel('2026-03-23T12:00:00Z', now)).toBe('6mo');
    expect(triageAgeLabel('2024-09-23T12:00:00Z', now)).toBe('2y');
  });

  it('floors a just-created row at 1m and blanks unparseable input', () => {
    expect(triageAgeLabel(now, now)).toBe('1m');
    expect(triageAgeLabel('not-a-date', now)).toBe('');
    expect(triageAgeLabel(null, now)).toBe('');
    expect(triageAgeLabel(undefined, now)).toBe('');
  });

  it('never reports a negative age for clock-skewed rows', () => {
    expect(triageAgeLabel('2026-09-24T12:00:00Z', now)).toBe('1m');
  });
});

describe('TEAM_TRIAGE_SNOOZE_ENABLED', () => {
  // Locks the documented decision: the task schema has no snoozed field and
  // `workAttention.triage` accepts only accept/decline/duplicate/reassign.
  // Flipping this without the backend write path is a dead control.
  it('stays disabled until the backend grows a snooze state', () => {
    expect(TEAM_TRIAGE_SNOOZE_ENABLED).toBe(false);
  });
});
