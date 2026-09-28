'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  applyBulkRowGesture,
  type BulkSelectGesture,
  type BulkSelection,
  EMPTY_BULK_SELECTION,
  pruneBulkSelection,
} from './bulkSelection';
import { isInteractiveRowClick } from './myWorkDisplay';

interface UseBulkSelectionOptions {
  /**
   * Bumps when the list identity changes (tab / layout / grouping / query
   * hash) — a selection only means something inside the list it came from.
   */
  resetKey: string;
  /** Ids of the rows currently rendered — the selection prunes to this set. */
  visibleIds: ReadonlySet<string>;
}

/**
 * Multi-select state for an issue list: cmd/ctrl-click toggles, shift-click
 * ranges (order supplied by the row at click time), Escape clears, a
 * pointer landing outside rows / the bulk bar / interactive chrome clears,
 * and rows that leave the rendered set drop out of the selection.
 */
export const useBulkSelection = ({ resetKey, visibleIds }: UseBulkSelectionOptions) => {
  const [selection, setSelection] = useState<BulkSelection>(EMPTY_BULK_SELECTION);
  const count = selection.ids.size;

  const applyGesture = useCallback(
    (taskId: string, gesture: BulkSelectGesture, orderedRowIds: readonly string[]) => {
      setSelection((current) => applyBulkRowGesture(current, orderedRowIds, taskId, gesture));
    },
    [],
  );

  const clear = useCallback(() => {
    setSelection((current) => (current.ids.size === 0 ? current : EMPTY_BULK_SELECTION));
  }, []);

  // New list identity — the old selection never crosses tabs/layouts/queries.
  useEffect(() => {
    setSelection(EMPTY_BULK_SELECTION);
  }, [resetKey]);

  // Rows leaving the rendered set (display filters, refetch) leave the
  // selection too — the bulk bar never acts on invisible issues.
  useEffect(() => {
    setSelection((current) => pruneBulkSelection(current, visibleIds));
  }, [visibleIds]);

  // Escape clears — after open menus/modals had first claim on the key
  // (their handlers preventDefault or stopPropagation before this fires).
  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) clear();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [clear, count]);

  // Click-away clears. Rows (`data-bulk-row-id`), the floating bar
  // (`data-bulk-actions`) and click-owning chrome (buttons, menus, open
  // popups) keep the selection; row modifier clicks never reach this
  // listener because the row's capture handler stops propagation.
  useEffect(() => {
    if (count === 0) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-bulk-row-id], [data-bulk-actions]')) return;
      if (isInteractiveRowClick(target)) return;
      clear();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [clear, count]);

  return { applyGesture, clear, count, selectedIds: selection.ids };
};
