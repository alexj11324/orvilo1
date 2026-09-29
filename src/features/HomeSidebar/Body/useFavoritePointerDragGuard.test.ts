import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFavoritePointerDragGuard } from './useFavoritePointerDragGuard';

describe('useFavoritePointerDragGuard', () => {
  it('cancels the release click after pointer movement crosses the drag threshold', () => {
    const { result } = renderHook(() => useFavoritePointerDragGuard());
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onPointerDownCapture({ clientX: 10, clientY: 10 });
    result.current.onPointerMoveCapture({ clientX: 10, clientY: 30 });
    result.current.onClick({ clientX: 10, clientY: 30, preventDefault, stopPropagation });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('preserves ordinary clicks when the pointer did not move far enough to drag', () => {
    const { result } = renderHook(() => useFavoritePointerDragGuard());
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onPointerDownCapture({ clientX: 10, clientY: 10 });
    result.current.onPointerMoveCapture({ clientX: 12, clientY: 12 });
    result.current.onClick({ clientX: 12, clientY: 12, preventDefault, stopPropagation });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('cancels the drop click on the shared drag flag even with empty row refs', () => {
    // Regression: the click after a drop reaches a row whose per-gesture refs
    // are empty (remounted mid-drag / capture path skipped) — the shared flag
    // owned by the DndContext host must still cancel it.
    const dragEndedRef = { current: true };
    const { result } = renderHook(() => useFavoritePointerDragGuard(dragEndedRef));
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onClick({ clientX: 10, clientY: 30, preventDefault, stopPropagation });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
