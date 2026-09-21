import { describe, expect, it } from 'vitest';

import {
  getCreateProjectInput,
  getProjectFieldSuggestions,
  isProjectIdentifierValid,
  isProjectSlugValid,
} from './createProjectForm';

describe('createProjectForm', () => {
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
