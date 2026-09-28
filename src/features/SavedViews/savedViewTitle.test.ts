import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { savedViewTitle } from './savedViewTitle';

describe('savedViewTitle', () => {
  const t = ((key: string) => key) as TFunction<'common'>;

  it('translates virtual builtin ids and leaves stored names alone', () => {
    expect(savedViewTitle('builtin:all', 'All tasks', t)).toBe('savedViews.builtinName.all');
    expect(savedViewTitle('view_private', 'Assigned to me', t)).toBe('Assigned to me');
  });
});
