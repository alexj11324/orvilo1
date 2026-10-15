import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeWebContextMenu,
  getSnapshot,
  setContextMenuInterceptor,
  showContextMenu,
  showWebContextMenu,
  subscribe,
  updateContextMenuItems,
  updateLastPointer,
} from './webStore';

afterEach(() => {
  setContextMenuInterceptor(null);
  closeWebContextMenu();
});

describe('native web menu store', () => {
  it('keeps the pointer anchor when items update during checkbox interaction', () => {
    updateLastPointer(new MouseEvent('contextmenu', { clientX: 123, clientY: 456 }));
    showWebContextMenu([{ key: 'a', label: 'A' }]);
    updateContextMenuItems([{ key: 'b', label: 'B' }]);
    expect(getSnapshot()).toMatchObject({
      open: true,
      point: { x: 123, y: 456 },
      items: [{ key: 'b' }],
    });
  });
  it('notifies subscribed hosts and stops after cleanup', () => {
    const listener = vi.fn();
    const cleanup = subscribe(listener);
    showWebContextMenu([]);
    expect(listener).toHaveBeenCalledTimes(1);
    cleanup();
    closeWebContextMenu();
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('native interception only opens the web menu when fallback is requested', () => {
    setContextMenuInterceptor({ show: (_items, _options, fallback) => fallback() });
    showContextMenu([{ label: 'Copy' }]);
    expect(getSnapshot().open).toBe(true);
    closeWebContextMenu();
    setContextMenuInterceptor({ show: vi.fn() });
    showContextMenu([{ label: 'Copy' }]);
    expect(getSnapshot().open).toBe(false);
  });
});
