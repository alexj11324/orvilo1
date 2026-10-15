import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMPOSER_FOCUS_REQUEST_TTL_MS,
  registerComposerFocus,
  requestComposerFocus,
} from './composerFocus';

afterEach(() => {
  vi.useRealTimers();
});
describe('exact conversation composer focus', () => {
  it('focuses the requested writable context and never another mounted editor', () => {
    const wrong = vi.fn();
    const right = vi.fn();
    const removeWrong = registerComposerFocus('other', { focus: wrong, isCurrent: () => true });
    const removeRight = registerComposerFocus('wanted', { focus: right, isCurrent: () => true });
    const cancel = requestComposerFocus('wanted');
    expect(right).toHaveBeenCalledTimes(1);
    expect(wrong).not.toHaveBeenCalled();
    cancel();
    removeWrong();
    removeRight();
  });
  it('waits for the actual mounted owner but cancellation and expiry remove pending work', () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    const cancel = requestComposerFocus('cancelled');
    cancel();
    const removeCancelled = registerComposerFocus('cancelled', { focus, isCurrent: () => true });
    expect(focus).not.toHaveBeenCalled();
    removeCancelled();
    requestComposerFocus('expired');
    vi.advanceTimersByTime(COMPOSER_FOCUS_REQUEST_TTL_MS);
    const removeExpired = registerComposerFocus('expired', { focus, isCurrent: () => true });
    expect(focus).not.toHaveBeenCalled();
    removeExpired();
    const cancelReady = requestComposerFocus('ready');
    const removeReady = registerComposerFocus('ready', { focus, isCurrent: () => true });
    expect(focus).toHaveBeenCalledTimes(1);
    cancelReady();
    removeReady();
  });
  it('invalidates a pending request when its sole owner becomes readonly or unmounts', () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    const settled = vi.fn();
    const release = registerComposerFocus('readonly-transition', { focus, isCurrent: () => false });
    requestComposerFocus('readonly-transition', settled);
    release();
    const releaseReplacement = registerComposerFocus('readonly-transition', {
      focus,
      isCurrent: () => true,
    });
    expect(focus).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    releaseReplacement();
  });
  it('rejects a stale/readonly identity and never chooses between ambiguous owners', () => {
    const first = vi.fn();
    const second = vi.fn();
    let current = false;
    const removeFirst = registerComposerFocus('same', { focus: first, isCurrent: () => current });
    const cancel = requestComposerFocus('same');
    expect(first).not.toHaveBeenCalled();
    current = true;
    const removeSecond = registerComposerFocus('same', { focus: second, isCurrent: () => true });
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    removeSecond();
    expect(first).toHaveBeenCalledTimes(1);
    cancel();
    removeFirst();
  });
});
