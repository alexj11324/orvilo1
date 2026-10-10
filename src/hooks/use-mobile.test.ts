import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from './use-mobile';

let media: MediaQueryList;
const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const setWidth = (width: number) =>
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

beforeEach(() => {
  media = Object.assign(new EventTarget(), {
    addListener: vi.fn(),
    media: '(max-width: 767px)',
    onchange: null,
    removeListener: vi.fn(),
  }) as MediaQueryList;
  Object.defineProperty(media, 'matches', { get: () => window.innerWidth < 768 });
  vi.spyOn(window, 'matchMedia').mockReturnValue(media);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor);
});

describe('native mobile viewport', () => {
  it.each([
    { mobile: true, width: 767 },
    { mobile: false, width: 768 },
    { mobile: false, width: 1440 },
  ])('resolves $width pixels to mobile=$mobile', ({ mobile, width }) => {
    setWidth(width);
    const { result } = renderHook(useIsMobile);
    expect(result.current).toBe(mobile);
  });

  it('updates across the breakpoint in both directions and unsubscribes on unmount', () => {
    setWidth(768);
    const remove = vi.spyOn(media, 'removeEventListener');
    const { result, unmount } = renderHook(useIsMobile);
    expect(result.current).toBe(false);
    act(() => {
      setWidth(767);
      media.dispatchEvent(new Event('change'));
    });
    expect(result.current).toBe(true);
    act(() => {
      setWidth(768);
      media.dispatchEvent(new Event('change'));
    });
    expect(result.current).toBe(false);
    unmount();
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('retains the desktop fallback during server rendering', () => {
    setWidth(767);
    const HookProbe = () => String(useIsMobile());
    expect(renderToString(createElement(HookProbe))).toBe('false');
  });
});
