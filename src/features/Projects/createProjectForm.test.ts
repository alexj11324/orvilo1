import { describe, expect, it } from 'vitest';

import {
  getCreateProjectInput,
  getProjectFieldSuggestions,
  isProjectIdentifierValid,
  isProjectSlugValid,
} from './createProjectForm';

describe('createProjectForm', () => {
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
