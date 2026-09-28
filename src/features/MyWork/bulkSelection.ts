/**
 * Multi-select model for issue lists (Linear parity). Pure and DOM-light so
 * the toggle/range/prune decisions are testable without rendering — the only
 * DOM touch is `bulkOrderedRowIds`, which reads the rendered row order off
 * `data-bulk-row-id` markers (visual order, including which groups are
 * collapsed, is the order shift-range selection should follow).
 */

export type BulkSelectGesture = 'range' | 'toggle';

export interface BulkSelection {
  /**
   * Row the next shift-click ranges from — set by every toggle gesture and
   * by a range that had no usable anchor. Preserved across range gestures so
   * repeated shift-clicks extend from the same point (Finder/Linear feel).
   */
  anchorId: string | null;
  /** Selected task ids (`task.id`, not identifier — ids are rename-stable). */
  ids: ReadonlySet<string>;
}

export const EMPTY_BULK_SELECTION: BulkSelection = { anchorId: null, ids: new Set() };

/**
 * Resolve a row click's modifier keys into a bulk gesture. Shift wins over
 * cmd/ctrl (cmd+shift+click still ranges); a bare click returns `null` and
 * keeps its normal row behaviour (navigate / peek-select).
 */
export const bulkGestureFromModifiers = (event: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): BulkSelectGesture | null => {
  if (event.shiftKey) return 'range';
  if (event.metaKey || event.ctrlKey) return 'toggle';
  return null;
};

/**
 * Contiguous slice of `orderedIds` from `anchorId` through `targetId`
 * (either direction). A missing/unknown anchor or target yields the target
 * alone — a shift-click with nothing sensible to range from degrades to a
 * plain select.
 */
export const bulkRangeIds = (
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
): string[] => {
  const targetIndex = orderedIds.indexOf(targetId);
  if (targetIndex === -1) return [];
  const anchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1;
  if (anchorIndex === -1) return [targetId];
  const [from, to] =
    anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  return orderedIds.slice(from, to + 1);
};

/**
 * Apply one row gesture to the selection.
 * - `toggle` flips the clicked row and re-anchors on it (Linear/cmd-click).
 * - `range` unions the anchor→target slice into the existing selection and
 *   leaves the anchor where it was — additive like Linear's shift-click, so
 *   cmd-picked rows survive a range extension. Without a usable anchor it
 *   anchors on the clicked row.
 */
export const applyBulkRowGesture = (
  selection: BulkSelection,
  orderedIds: readonly string[],
  taskId: string,
  gesture: BulkSelectGesture,
): BulkSelection => {
  if (gesture === 'toggle') {
    const ids = new Set(selection.ids);
    if (ids.has(taskId)) {
      ids.delete(taskId);
    } else {
      ids.add(taskId);
    }
    return { anchorId: taskId, ids };
  }
  const anchorId =
    selection.anchorId && orderedIds.includes(selection.anchorId) ? selection.anchorId : taskId;
  const ids = new Set(selection.ids);
  for (const id of bulkRangeIds(orderedIds, anchorId, taskId)) ids.add(id);
  return { anchorId, ids };
};

/**
 * Drop selected ids that left the rendered set (display filters, refetch,
 * paging reset). Returns the same state object when nothing changed so
 * effect-driven pruning does not loop renders. The anchor follows the same
 * rule — a rendered-out anchor cannot produce a sensible next range.
 */
export const pruneBulkSelection = (
  selection: BulkSelection,
  visibleIds: ReadonlySet<string>,
): BulkSelection => {
  let changed = false;
  const ids = new Set<string>();
  for (const id of selection.ids) {
    if (visibleIds.has(id)) {
      ids.add(id);
    } else {
      changed = true;
    }
  }
  const anchorId =
    selection.anchorId !== null && visibleIds.has(selection.anchorId) ? selection.anchorId : null;
  if (!changed && anchorId === selection.anchorId) return selection;
  return { anchorId, ids };
};

/**
 * Rendered row order inside one `data-bulk-list` root — the source of truth
 * for shift-range slices. Collapsed groups are absent from the DOM, so a
 * range can never reach into hidden rows.
 */
export const bulkOrderedRowIds = (listRoot: ParentNode): string[] =>
  [...listRoot.querySelectorAll('[data-bulk-row-id]')]
    .map((element) => element.getAttribute('data-bulk-row-id'))
    .filter((id): id is string => Boolean(id));
