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
});
