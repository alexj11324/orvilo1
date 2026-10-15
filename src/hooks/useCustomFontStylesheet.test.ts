import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCustomFontStylesheet } from './useCustomFontStylesheet';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCustomFontStylesheet', () => {
  it('loads only the selected custom URL and cleans up on replacement, clearing and unmount', () => {
    const existing = document.createElement('link');
    existing.rel = 'stylesheet';
    existing.href = '/existing-theme-font.css';
    document.head.append(existing);
    const before = document.head.querySelectorAll('link').length;
    const initialProps: { url: string | undefined } = { url: undefined };
    const { rerender, unmount } = renderHook(
      ({ url }: { url: string | undefined }) => useCustomFontStylesheet(url),
      { initialProps },
    );
    expect(document.head.querySelectorAll('link')).toHaveLength(before);
    rerender({ url: '/custom-font-first.css' });
    const first = document.head.querySelector('link[href="/custom-font-first.css"]');
    expect(first?.getAttribute('rel')).toBe('stylesheet');
    rerender({ url: '/custom-font-second.css' });
    expect(first?.isConnected).toBe(false);
    expect(document.head.querySelector('link[href="/custom-font-second.css"]')).not.toBeNull();
    rerender({ url: '' });
    expect(document.head.querySelector('link[href="/custom-font-second.css"]')).toBeNull();
    expect(existing.isConnected).toBe(true);
    rerender({ url: '/custom-font-third.css' });
    const third = document.head.querySelector('link[href="/custom-font-third.css"]');
    unmount();
    expect(third?.isConnected).toBe(false);
    expect(existing.isConnected).toBe(true);
    existing.remove();
  });

  it('reports a stylesheet load error and removes that listener during cleanup', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useCustomFontStylesheet('/custom-font-error.css'));
    const element = document.head.querySelector('link[href="/custom-font-error.css"]');
    expect(element).not.toBeNull();
    element?.dispatchEvent(new Event('error'));
    expect(report).toHaveBeenCalledExactlyOnceWith(
      'Failed to load font from /custom-font-error.css',
    );
    unmount();
    element?.dispatchEvent(new Event('error'));
    expect(report).toHaveBeenCalledTimes(1);
  });
});
