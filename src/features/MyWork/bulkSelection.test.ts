import { describe, expect, it } from 'vitest';

import {
  applyBulkRowGesture,
  bulkGestureFromModifiers,
  bulkOrderedRowIds,
  bulkRangeIds,
  type BulkSelection,
  EMPTY_BULK_SELECTION,
  pruneBulkSelection,
} from './bulkSelection';

const selection = (ids: string[], anchorId: string | null = null): BulkSelection => ({
  anchorId,
  ids: new Set(ids),
});

describe('bulkGestureFromModifiers', () => {
  it('maps cmd/ctrl clicks to toggle', () => {
    expect(bulkGestureFromModifiers({ metaKey: true })).toBe('toggle');
    expect(bulkGestureFromModifiers({ ctrlKey: true })).toBe('toggle');
  });

  it('maps shift clicks to range — shift wins over cmd/ctrl', () => {
    expect(bulkGestureFromModifiers({ shiftKey: true })).toBe('range');
    expect(bulkGestureFromModifiers({ metaKey: true, shiftKey: true })).toBe('range');
  });

  it('leaves plain clicks alone', () => {
    expect(bulkGestureFromModifiers({})).toBeNull();
    expect(bulkGestureFromModifiers({ metaKey: false, shiftKey: false })).toBeNull();
  });
});

describe('bulkRangeIds', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('slices forward and backward inclusively', () => {
    expect(bulkRangeIds(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(bulkRangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('falls back to the target alone when the anchor is missing', () => {
    expect(bulkRangeIds(order, null, 'c')).toEqual(['c']);
    expect(bulkRangeIds(order, 'zzz', 'c')).toEqual(['c']);
  });

  it('returns nothing when the target is not rendered', () => {
    expect(bulkRangeIds(order, 'a', 'zzz')).toEqual([]);
  });
});

describe('applyBulkRowGesture', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('toggle adds an unselected id and anchors on it', () => {
    const next = applyBulkRowGesture(EMPTY_BULK_SELECTION, order, 'b', 'toggle');
    expect([...next.ids]).toEqual(['b']);
    expect(next.anchorId).toBe('b');
  });

  it('toggle removes a selected id and still re-anchors', () => {
    const next = applyBulkRowGesture(selection(['a', 'b'], 'a'), order, 'b', 'toggle');
    expect([...next.ids]).toEqual(['a']);
    expect(next.anchorId).toBe('b');
  });

  it('range unions the anchor→target slice into the selection', () => {
    const next = applyBulkRowGesture(selection(['a'], 'a'), order, 'c', 'range');
    expect([...next.ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('range keeps the existing anchor for the next shift-click', () => {
    const first = applyBulkRowGesture(selection(['a'], 'a'), order, 'c', 'range');
    const second = applyBulkRowGesture(first, order, 'd', 'range');
    // Anchor stayed on `a`, so the second range extends a→d rather than c→d.
    expect([...second.ids].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(second.anchorId).toBe('a');
  });

  it('range without a usable anchor anchors on the clicked row', () => {
    const next = applyBulkRowGesture(EMPTY_BULK_SELECTION, order, 'c', 'range');
    expect([...next.ids]).toEqual(['c']);
    expect(next.anchorId).toBe('c');
  });

  it('range with an anchor that left the list re-anchors on the clicked row', () => {
    const next = applyBulkRowGesture(selection(['x'], 'x'), order, 'c', 'range');
    expect([...next.ids].sort()).toEqual(['c', 'x']);
    expect(next.anchorId).toBe('c');
  });
});

describe('pruneBulkSelection', () => {
  it('drops ids that left the rendered set', () => {
    const next = pruneBulkSelection(selection(['a', 'b', 'c'], 'a'), new Set(['a', 'c']));
    expect([...next.ids].sort()).toEqual(['a', 'c']);
    expect(next.anchorId).toBe('a');
  });

  it('clears an anchor that left the rendered set', () => {
    const next = pruneBulkSelection(selection(['a', 'b'], 'b'), new Set(['a']));
    expect(next.anchorId).toBeNull();
    expect([...next.ids]).toEqual(['a']);
  });

  it('returns the same object when nothing changed', () => {
    const current = selection(['a', 'b'], 'a');
    expect(pruneBulkSelection(current, new Set(['a', 'b', 'c']))).toBe(current);
  });
});

describe('bulkOrderedRowIds', () => {
  it('reads rendered row order from data-bulk-row-id markers', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-bulk-row-id="a"></div>
      <section><div data-bulk-row-id="b"></div></section>
      <div data-bulk-row-id="c"></div>
    `;
    expect(bulkOrderedRowIds(root)).toEqual(['a', 'b', 'c']);
  });

  it('ignores rows outside the given list root', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    inner.innerHTML = `<div data-bulk-row-id="b"></div>`;
    outer.innerHTML = `<div data-bulk-row-id="a"></div>`;
    outer.append(inner);
    expect(bulkOrderedRowIds(inner)).toEqual(['b']);
  });
});
