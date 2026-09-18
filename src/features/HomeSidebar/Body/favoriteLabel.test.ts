import { describe, expect, it } from 'vitest';

import { favoriteLabel } from './favoriteLabel';

describe('favoriteLabel', () => {
  const t = (key: string) => key;

  it('uses a resolved title when the caller can still read the target', () => {
    expect(favoriteLabel('savedView', 'Assigned to me', t)).toBe('Assigned to me');
  });

  it('does not leak a raw target id after the title is gone', () => {
    expect(favoriteLabel('task', null, t)).toBe('favorites.task');
    expect(favoriteLabel('savedView', '   ', t)).toBe('favorites.savedView');
  });
});
