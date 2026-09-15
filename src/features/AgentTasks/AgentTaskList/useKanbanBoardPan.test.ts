import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useKanbanBoardPan } from './useKanbanBoardPan';

const fakePointerEvent = (over: Partial<PointerEvent<HTMLDivElement>>) =>
  ({
    button: 0,
    buttons: 1,
    clientX: 0,
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
    target: null,
    ...over,
  }) as unknown as PointerEvent<HTMLDivElement>;

describe('useKanbanBoardPan', () => {
  it('pans by the physical pointer delta so RTL scroll coordinates cannot break it', () => {
    const el = document.createElement('div');
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy;
    // RTL engines report negative scrollLeft (Chrome/Firefox) or a descending
    // positive one (Safari). Reading or clamping that coordinate would pin the
    // board at 0 — the pan must stay in physical space instead.
    el.scrollLeft = -80;

    const { result } = renderHook(() => useKanbanBoardPan<HTMLDivElement>());
    result.current.ref.current = el;

    act(() => result.current.onPointerDown(fakePointerEvent({ clientX: 100 })));
    act(() => result.current.onPointerMove(fakePointerEvent({ clientX: 120 })));
    act(() => result.current.onPointerMove(fakePointerEvent({ clientX: 110 })));

    // Pointer right by 20 pans left by 20; back by 10 pans right by 10.
    expect(scrollBy).toHaveBeenNthCalledWith(1, { behavior: 'instant', left: -20 });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { behavior: 'instant', left: 10 });
  });

  it('never starts a pan from a card or interactive element', () => {
    const el = document.createElement('div');
    const card = document.createElement('div');
    card.setAttribute('data-board-card', '');
    el.appendChild(card);
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy;

    const { result } = renderHook(() => useKanbanBoardPan<HTMLDivElement>());
    result.current.ref.current = el;

    act(() => result.current.onPointerDown(fakePointerEvent({ clientX: 100, target: card })));
    act(() => result.current.onPointerMove(fakePointerEvent({ clientX: 160 })));

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('ignores sub-threshold jitter before the pan activates', () => {
    const el = document.createElement('div');
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy;

    const { result } = renderHook(() => useKanbanBoardPan<HTMLDivElement>());
    result.current.ref.current = el;

    act(() => result.current.onPointerDown(fakePointerEvent({ clientX: 100 })));
    act(() => result.current.onPointerMove(fakePointerEvent({ clientX: 103 })));

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
