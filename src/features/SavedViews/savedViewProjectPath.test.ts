import { describe, expect, it } from 'vitest';

import { savedViewProjectPath } from './savedViewProjectPath';

describe('savedViewProjectPath', () => {
  it('prefers the project slug when it is present', () => {
    expect(savedViewProjectPath({ id: 'prj_1', slug: 'alpha' })).toBe('/project/alpha');
  });

  it('falls back to the project id when the slug is missing', () => {
    expect(savedViewProjectPath({ id: 'prj_1', slug: null })).toBe('/project/prj_1');
    expect(savedViewProjectPath({ id: 'prj_1', slug: '' })).toBe('/project/prj_1');
    expect(savedViewProjectPath({ id: 'prj_1' })).toBe('/project/prj_1');
  });
});
