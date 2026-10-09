import { TRPCClientError } from '@trpc/client';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import type { ProjectPriority, ProjectStatus } from './createProjectForm';
import {
  getCreateProjectErrorKey,
  getCreateProjectInput,
  getProjectFieldSuggestions,
  isProjectIdentifierValid,
  isProjectSlugValid,
} from './createProjectForm';
import {
  formatProjectActivityTime,
  formatProjectDate,
  getProjectDatePickerMode,
  snapProjectDateToPrecision,
} from './projectPlanningDate';

describe('createProjectForm', () => {
  it('defaults project creation to private while preserving an explicit public choice', () => {
    const draft = { identifier: 'NEW', name: 'New project', slug: '' };
    expect(getCreateProjectInput(draft)).toMatchObject({ visibility: 'private' });
    expect(getCreateProjectInput({ ...draft, visibility: 'public' })).toMatchObject({
      visibility: 'public',
    });
  });
  it('preserves an explicitly private project in the creation request', () => {
    expect(
      getCreateProjectInput({
        identifier: 'PRIV',
        name: 'Private project',
        slug: 'private-project',
        visibility: 'private',
      }),
    ).toMatchObject({ visibility: 'private' });
  });
  it.each(['2026 Roadmap', '2026'])('suggests a submittable identifier for %s', (name) => {
    const suggestions = getProjectFieldSuggestions(name);
    expect(isProjectIdentifierValid(suggestions.identifier)).toBe(true);
    expect(getCreateProjectInput({ name, ...suggestions })).not.toBeNull();
  });
  it('submits project details and planning properties instead of discarding them', () => {
    const draft = {
      identifier: 'NEW',
      name: 'Launch',
      slug: 'launch',
      avatar: '🚀',
      summary: ' Short summary ',
      description: ' Project brief ',
      leadUserId: 'member',
      teamId: 'design',
      startDate: '2026-09-21',
      targetDate: '2026-10-01',
    };
    expect(getCreateProjectInput(draft)).toEqual({
      ...draft,
      visibility: 'private',
      summary: 'Short summary',
      description: 'Project brief',
    });
  });

  it('keeps selectable project fields and milestone drafts in the create input', () => {
    expect(
      getCreateProjectInput({
        dependencies: [
          { projectId: 'project-a', type: 'blockedBy' },
          { projectId: 'project-b', type: 'blocking' },
        ],
        identifier: 'NEW',
        labelIds: ['label-a'],
        memberIds: ['member-a', 'member-b'],
        milestones: [
          {
            date: '2026-10-01',
            description: ' Brief ',
            name: ' Launch ',
          },
        ],
        name: 'Launch',
        newLabelNames: [' UI parity ', 'UI parity'],
        priority: 2,
        slug: '',
        startDate: '2026-09-01',
        startDatePrecision: 'month',
        status: 'active',
        targetDate: '2026-10-01',
        targetDatePrecision: 'quarter',
      }),
    ).toEqual({
      dependencies: [
        { projectId: 'project-a', type: 'blockedBy' },
        { projectId: 'project-b', type: 'blocking' },
      ],
      visibility: 'private',
      identifier: 'NEW',
      labelIds: ['label-a'],
      memberIds: ['member-a', 'member-b'],
      milestones: [{ date: '2026-10-01', description: 'Brief', name: 'Launch' }],
      name: 'Launch',
      newLabelNames: ['UI parity'],
      priority: 2,
      startDate: '2026-09-01',
      startDatePrecision: 'month',
      status: 'active',
      targetDate: '2026-10-01',
      targetDatePrecision: 'quarter',
    });
  });

  it('formats planning dates according to their selected precision', () => {
    expect(formatProjectDate('2026-02-14', 'day')).toBe('2026/02/14');
    expect(formatProjectDate('2026-02-14', 'month')).toBe('2026/02');
    expect(formatProjectDate('2026-02-14', 'quarter')).toBe('2026 Q1');
    expect(formatProjectDate('2026-09-14', 'halfYear')).toBe('2026 H2');
    expect(formatProjectDate('2026-09-14', 'year')).toBe('2026');
    expect(formatProjectDate('not-a-date', 'day')).toBe('');
    expect(formatProjectDate(undefined, 'month')).toBe('');
  });

  it.each([
    ['day', 'date'],
    ['month', 'month'],
    ['quarter', 'quarter'],
    ['halfYear', 'halfYear'],
    ['year', 'year'],
  ] as const)('maps %s precision to its date input mode', (precision, pickerMode) => {
    expect(getProjectDatePickerMode(precision)).toBe(pickerMode);
  });

  it.each([
    ['day', '2026-09-23', '2026-09-23'],
    ['month', '2026-09-23', '2026-09-01'],
    ['quarter', '2026-08-23', '2026-07-01'],
    ['halfYear', '2026-09-23', '2026-07-01'],
    ['halfYear', '2026-03-23', '2026-01-01'],
    ['year', '2026-09-23', '2026-01-01'],
  ] as const)('snaps %s precision %s to %s', (precision, input, expected) => {
    expect(snapProjectDateToPrecision(dayjs(input), precision).format('YYYY-MM-DD')).toBe(expected);
  });

  it('formats activity timestamps as numeric days once they are older than a day', () => {
    const now = new Date(2026, 9, 9, 12);
    expect(formatProjectActivityTime(new Date(2026, 8, 23, 9), now).text).toBe('2026/09/23');
    expect(formatProjectActivityTime(new Date(2025, 11, 5, 9), now).text).toBe('2025/12/05');
    expect(formatProjectActivityTime(new Date(2026, 9, 9, 9), now).text).not.toContain('/');
  });

  it.each(['completed', 'reviewing'] as const)(
    'filters %s and out-of-range priority from create input',
    (status) => {
      expect(
        getCreateProjectInput({
          identifier: 'NEW',
          name: 'Launch',
          priority: 99 as ProjectPriority,
          slug: '',
          status,
        }),
      ).toEqual({ identifier: 'NEW', name: 'Launch', visibility: 'private' });
    },
  );

  it('keeps Planned as a non-completion project status', () => {
    expect(
      getCreateProjectInput({
        identifier: 'NEW',
        name: 'Launch',
        slug: '',
        status: 'planned' as ProjectStatus,
      }),
    ).toMatchObject({ status: 'planned' });
  });

  it('does not allow a target date before the start date', () => {
    const draft = {
      identifier: 'NEW',
      name: 'Launch',
      slug: '',
      startDate: '2026-10-01',
      targetDate: '2026-09-21',
    };
    expect(getCreateProjectInput(draft)).toBeNull();
  });
  it('derives a valid identifier and slug from the project name', () => {
    expect(getProjectFieldSuggestions('Orvilo')).toEqual({
      identifier: 'ORVI',
      slug: 'orvilo',
    });
    expect(getProjectFieldSuggestions('Orvilo Mobile App')).toEqual({
      identifier: 'OMA',
      slug: 'orvilo-mobile-app',
    });
    expect(getProjectFieldSuggestions('用户记忆')).toEqual({
      identifier: 'YHJY',
      slug: 'yong-hu-ji-yi',
    });
  });

  it('returns empty suggestions when the project name is empty', () => {
    expect(getProjectFieldSuggestions('  ')).toEqual({ identifier: '', slug: '' });
  });

  it('validates the identifier format shown by the form', () => {
    expect(isProjectIdentifierValid('ORVILO')).toBe(true);
    expect(isProjectIdentifierValid('LH')).toBe(false);
    expect(isProjectIdentifierValid('1ORVILO')).toBe(false);
  });

  it('normalizes and includes a user-provided slug', () => {
    expect(
      getCreateProjectInput({
        identifier: ' orvilo ',
        name: '  Orvilo Project  ',
        slug: '  Orvilo-Project  ',
      }),
    ).toEqual({
      identifier: 'ORVILO',
      visibility: 'private',
      name: 'Orvilo Project',
      slug: 'orvilo-project',
    });
  });

  it('omits an empty slug so the backend can generate one', () => {
    expect(
      getCreateProjectInput({ identifier: 'ORVILO', name: 'Orvilo Project', slug: '  ' }),
    ).toEqual({ identifier: 'ORVILO', name: 'Orvilo Project', visibility: 'private' });
  });

  it('rejects malformed slugs', () => {
    expect(isProjectSlugValid('two--hyphens')).toBe(false);
    expect(isProjectSlugValid('contains spaces')).toBe(false);
    expect(
      getCreateProjectInput({ identifier: 'ORVILO', name: 'Orvilo Project', slug: '-invalid' }),
    ).toBeNull();
  });
});

describe('project creation recovery', () => {
  it('explains how to recover when a private Orchestrator cannot create a public project', () => {
    expect(getCreateProjectErrorKey(new TRPCClientError('ORCHESTRATOR_SOURCE_PRIVATE'))).toBe(
      'create.orchestratorPrivate',
    );
  });
  it.each([new Error('network unavailable'), null])(
    'retains the generic message for unrelated errors',
    (error) => {
      expect(getCreateProjectErrorKey(error)).toBe('common:operationFailed');
    },
  );
});
