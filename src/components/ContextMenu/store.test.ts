import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeContextMenu,
  getSnapshot,
  showContextMenu,
  subscribe,
  updateContextMenuItems,
  updateLastPointer,
} from './store';

afterEach(() => closeContextMenu());

describe('context menu store', () => {
  it('opens at the last pointer position with the given items and slots', () => {
    updateLastPointer(new MouseEvent('contextmenu', { clientX: 12, clientY: 34 }));

    showContextMenu([{ key: 'copy', label: 'Copy' }], { header: 'Header' });

    expect(getSnapshot()).toMatchObject({
      header: 'Header',
      items: [{ key: 'copy', label: 'Copy' }],
      open: true,
      point: { x: 12, y: 34 },
    });
  });

  it('replaces items without moving an open menu', () => {
    updateLastPointer(new MouseEvent('pointerdown', { clientX: 5, clientY: 6 }));
    showContextMenu([{ key: 'a', label: 'A' }]);

    updateContextMenuItems([{ key: 'b', label: 'B' }]);

    expect(getSnapshot()).toMatchObject({ items: [{ key: 'b' }], point: { x: 5, y: 6 } });
  });

  it('resets on close and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    showContextMenu([{ key: 'a', label: 'A' }], { footer: 'Footer' });

    closeContextMenu();

    expect(getSnapshot()).toEqual({ items: [], open: false, point: null });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
