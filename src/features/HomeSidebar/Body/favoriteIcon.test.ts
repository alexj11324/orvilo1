import type { NavigationFavoriteTargetType } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { FAVORITE_TARGET_ICONS } from './favoriteIcon';

describe('FAVORITE_TARGET_ICONS', () => {
  it('maps every favorite target type to an icon', () => {
    const targetTypes: NavigationFavoriteTargetType[] = ['project', 'savedView', 'task', 'team'];

    for (const targetType of targetTypes) {
      expect(FAVORITE_TARGET_ICONS[targetType]).toBeTruthy();
    }
  });
});
