import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getFloatingCollisionPadding,
  setFloatingCollisionPadding,
} from '@/libs/contextMenu/collisionPadding';

import { reserveTitleBarForFloatingLayers } from './floatingLayers';

afterEach(() => setFloatingCollisionPadding(undefined));

describe('reserveTitleBarForFloatingLayers', () => {
  it('keeps every base-ui floating layer below the desktop title bar', () => {
    reserveTitleBarForFloatingLayers();

    expect(getFloatingCollisionPadding()).toMatchObject({ top: TITLE_BAR_HEIGHT });
  });
});
