import { describe, expect, it } from 'vitest';

import { closestScrollParent } from './useClosestScrollParent';

describe('closestScrollParent', () => {
  it('returns the nearest overflow ancestor', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const child = document.createElement('div');
    scroller.append(child);
    document.body.append(scroller);

    expect(closestScrollParent(child)).toBe(scroller);

    scroller.remove();
  });

  it('returns undefined when nothing scrolls', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.append(child);
    document.body.append(parent);

    expect(closestScrollParent(child)).toBeUndefined();
    expect(closestScrollParent(null)).toBeUndefined();

    parent.remove();
  });
});
