import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isMenuDigitAcceleratorEvent, useMenuDigitShortcuts } from './useMenuDigitShortcuts';

const dispatchDigit = (key: string, init: KeyboardEventInit = {}, target?: HTMLElement) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init });
  (target ?? document).dispatchEvent(event);
  return event;
};

describe('isMenuDigitAcceleratorEvent', () => {
  it('rejects modified digits, compositions, repeats, and handled events', () => {
    const plain = dispatchDigit('1');
    expect(isMenuDigitAcceleratorEvent(plain)).toBe(true);

    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { isComposing: true },
      { repeat: true },
    ]) {
      expect(isMenuDigitAcceleratorEvent(new KeyboardEvent('keydown', { key: '1', ...init }))).toBe(
        false,
      );
    }

    const handled = new KeyboardEvent('keydown', { cancelable: true, key: '1' });
    handled.preventDefault();
    expect(isMenuDigitAcceleratorEvent(handled)).toBe(false);
  });

  it('rejects digits typed into editable targets', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const event = new KeyboardEvent('keydown', { key: '1' });
    Object.defineProperty(event, 'target', { value: input });
    expect(isMenuDigitAcceleratorEvent(event)).toBe(false);

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.append(editable);
    const rich = new KeyboardEvent('keydown', { key: '1' });
    Object.defineProperty(rich, 'target', { value: editable });
    expect(isMenuDigitAcceleratorEvent(rich)).toBe(false);
  });
});

describe('useMenuDigitShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('picks the numbered item on a plain digit and closes via the caller', () => {
    const onPick = vi.fn();
    renderHook(({ open }) => useMenuDigitShortcuts({ items: ['a', 'b'], onPick, open }), {
      initialProps: { open: true },
    });

    const event = dispatchDigit('2');

    expect(event.defaultPrevented).toBe(true);
    expect(onPick).toHaveBeenCalledWith('b');
  });

  it('ignores digits outside the pickable range without swallowing them', () => {
    const onPick = vi.fn();
    renderHook(() => useMenuDigitShortcuts({ items: ['a'], onPick, open: true }));

    const event = dispatchDigit('9');

    expect(event.defaultPrevented).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['alt', { altKey: true }],
    ['composition', { isComposing: true }],
    ['repeat', { repeat: true }],
  ])('does not mutate on a %s-modified digit', (_name, init) => {
    const onPick = vi.fn();
    renderHook(() => useMenuDigitShortcuts({ items: ['a', 'b'], onPick, open: true }));

    const event = dispatchDigit('1', init);

    expect(event.defaultPrevented).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('leaves digits typed into the menu search input as text', () => {
    const onPick = vi.fn();
    renderHook(() => useMenuDigitShortcuts({ items: ['a', 'b'], onPick, open: true }));
    const input = document.createElement('input');
    document.body.append(input);

    const event = dispatchDigit('1', {}, input);

    expect(event.defaultPrevented).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('lets only the most recently opened menu answer', () => {
    const onPickFirst = vi.fn();
    const onPickSecond = vi.fn();
    renderHook(() => useMenuDigitShortcuts({ items: ['a'], onPick: onPickFirst, open: true }));
    renderHook(() => useMenuDigitShortcuts({ items: ['x'], onPick: onPickSecond, open: true }));

    dispatchDigit('1');

    expect(onPickFirst).not.toHaveBeenCalled();
    expect(onPickSecond).toHaveBeenCalledWith('x');
  });

  it('returns control to the earlier menu once the top one closes', () => {
    const onPickFirst = vi.fn();
    const onPickSecond = vi.fn();
    renderHook(() => useMenuDigitShortcuts({ items: ['a'], onPick: onPickFirst, open: true }));
    const { rerender } = renderHook(
      ({ open }) => useMenuDigitShortcuts({ items: ['x'], onPick: onPickSecond, open }),
      { initialProps: { open: true } },
    );

    rerender({ open: false });
    dispatchDigit('1');

    expect(onPickFirst).toHaveBeenCalledWith('a');
    expect(onPickSecond).not.toHaveBeenCalled();
  });

  it('leaves no document listener behind after the menu closes', () => {
    const onPick = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ open }) => useMenuDigitShortcuts({ items: ['a'], onPick, open }),
      { initialProps: { open: true } },
    );

    rerender({ open: false });
    dispatchDigit('1');
    expect(onPick).not.toHaveBeenCalled();

    rerender({ open: true });
    unmount();
    dispatchDigit('1');
    expect(onPick).not.toHaveBeenCalled();
  });
});
