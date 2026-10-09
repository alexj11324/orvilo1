import { cx } from 'antd-style';
import { describe, expect, it } from 'vitest';

import { sortIconActiveClass } from './sortOrder';

describe('sortIconActiveClass', () => {
  it('is composable by cx when sortOrder is null or undefined', () => {
    expect(() => cx('base', sortIconActiveClass(null))).not.toThrow();
    expect(() => cx('base', sortIconActiveClass(undefined))).not.toThrow();
    expect(cx('base', sortIconActiveClass(null))).toBe('base');
  });

  it('marks ascend and descend as active', () => {
    expect(cx('base', sortIconActiveClass('ascend'))).toBe('base active');
    expect(cx('base', sortIconActiveClass('descend'))).toBe('base active');
  });
});
