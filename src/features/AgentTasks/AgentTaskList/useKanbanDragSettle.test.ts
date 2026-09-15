import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useKanbanDragSettle } from './useKanbanDragSettle';

describe('useKanbanDragSettle', () => {
  it('keeps the settle lock until the LAST overlapping drop releases', () => {
    const { result } = renderHook(() => useKanbanDragSettle(() => ({})));

    const releaseA = result.current.beginSettle();
    const releaseB = result.current.beginSettle();
    const versionBefore = result.current.settleVersion;

    // The first drop finishing must not free the mirror while its sibling is
    // still in flight — a resync would clobber the sibling's optimistic move.
    act(() => releaseA());
    expect(result.current.isSettlingRef.current).toBe(true);
    expect(result.current.settleVersion).toBe(versionBefore);

    act(() => releaseB());
    expect(result.current.isSettlingRef.current).toBe(false);
    expect(result.current.settleVersion).toBe(versionBefore + 1);
  });

  it('skips the resync when the only drop asks to keep its optimistic placement', () => {
    const { result } = renderHook(() => useKanbanDragSettle(() => ({})));

    const release = result.current.beginSettle();
    const versionBefore = result.current.settleVersion;

    // The move persisted but its reconcile failed — the card stays where the
    // user dropped it and no stale resync may revert it.
    act(() => release({ resync: false }));
    expect(result.current.isSettlingRef.current).toBe(false);
    expect(result.current.settleVersion).toBe(versionBefore);
  });

  it('still resyncs when a sibling released normally even after a resync:false release', () => {
    const { result } = renderHook(() => useKanbanDragSettle(() => ({})));

    const releaseA = result.current.beginSettle();
    const releaseB = result.current.beginSettle();
    const versionBefore = result.current.settleVersion;

    act(() => releaseA({ resync: false }));
    act(() => releaseB());
    expect(result.current.settleVersion).toBe(versionBefore + 1);
  });

  it('ignores a double release of the same settle', () => {
    const { result } = renderHook(() => useKanbanDragSettle(() => ({})));

    const release = result.current.beginSettle();
    act(() => {
      release();
      release();
    });
    expect(result.current.isSettlingRef.current).toBe(false);
    expect(result.current.settleVersion).toBe(1);
  });
});
