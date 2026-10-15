import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getFloatingCollisionPadding,
  setFloatingCollisionPadding,
} from '@/libs/floatingCollisionPadding';

import { reserveTitleBarForFloatingLayers } from './floatingLayers';

afterEach(() => setFloatingCollisionPadding(undefined));

describe('reserveTitleBarForFloatingLayers', () => {
  it('keeps the app floating layers below the desktop title bar', () => {
    reserveTitleBarForFloatingLayers();

    expect(getFloatingCollisionPadding()).toMatchObject({ top: TITLE_BAR_HEIGHT });
  });
});
