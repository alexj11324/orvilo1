import { describe, expect, it } from 'vitest';

import type { ProjectPriority, ProjectStatus } from './createProjectForm';
import {
  getCreateProjectInput,
  getProjectFieldSuggestions,
  isProjectIdentifierValid,
  isProjectSlugValid,
} from './createProjectForm';
import { formatProjectDate, getProjectDatePickerMode } from './projectPlanningDate';

describe('createProjectForm', () => {
  it('drops the current year from day dates, like Linear, in each locale', () => {
    const now = '2026-09-24';
    expect(formatProjectDate('2026-12-01', 'day', { now })).toBe('Dec 1');
    expect(formatProjectDate('2027-02-28', 'day', { now })).toBe('Feb 28, 2027');

    // The Chinese labels come from `time.formatThisYear` / `time.formatOtherYear`;
    // the old English pattern rendered "12月 1, 2026" — no 日, year always shown.
    const zh = { formatOtherYear: 'YYYY年M月D日', formatThisYear: 'M月D日', locale: 'zh-CN', now };
    expect(formatProjectDate('2026-12-01', 'day', zh)).toBe('12月1日');
    expect(formatProjectDate('2027-02-28', 'day', zh)).toBe('2027年2月28日');
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
    expect(formatProjectDate('2026-02-14', 'day', { now: '2025-06-01' })).toBe('Feb 14, 2026');
    expect(formatProjectDate('2026-02-14', 'month')).toBe('Feb 2026');
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
    ['halfYear', 'month'],
    ['year', 'year'],
  ] as const)('maps %s precision to its date input mode', (precision, pickerMode) => {
    expect(getProjectDatePickerMode(precision)).toBe(pickerMode);
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
      ).toEqual({ identifier: 'NEW', name: 'Launch' });
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
      name: 'Orvilo Project',
      slug: 'orvilo-project',
    });
  });

  it('omits an empty slug so the backend can generate one', () => {
    expect(
      getCreateProjectInput({ identifier: 'ORVILO', name: 'Orvilo Project', slug: '  ' }),
    ).toEqual({ identifier: 'ORVILO', name: 'Orvilo Project' });
  });

  it('rejects malformed slugs', () => {
    expect(isProjectSlugValid('two--hyphens')).toBe(false);
    expect(isProjectSlugValid('contains spaces')).toBe(false);
    expect(
      getCreateProjectInput({ identifier: 'ORVILO', name: 'Orvilo Project', slug: '-invalid' }),
    ).toBeNull();
  });
});
