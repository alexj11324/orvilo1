import { describe, expect, it } from 'vitest';

import { transitionSavedViewControl } from './savedViewControlState';

describe('transitionSavedViewControl', () => {
  it('discards the hidden draft when switching control popovers', () => {
    expect(transitionSavedViewControl('filters', 'display', true)).toEqual({
      next: 'display',
      resetDraft: true,
    });
  });

  it('discards a draft when its popover is dismissed', () => {
    expect(transitionSavedViewControl('display', 'display', false)).toEqual({
      next: null,
      resetDraft: true,
    });
  });

  it('ignores a stale close event from the inactive popover', () => {
    expect(transitionSavedViewControl('display', 'filters', false)).toEqual({
      next: 'display',
      resetDraft: false,
    });
  });
});
