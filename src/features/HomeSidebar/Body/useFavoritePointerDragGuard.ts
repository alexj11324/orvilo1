import { type RefObject, useCallback, useRef } from 'react';

interface PointerCoordinates {
  clientX: number;
  clientY: number;
}

interface ClickCancellation extends PointerCoordinates {
  preventDefault: () => void;
  stopPropagation: () => void;
}

/**
 * `dragEndedRef` is owned by the enclosing DndContext host: it is set on
 * drag start and cleared a tick after drag end/cancel, so the click the
 * browser dispatches on the drop's anchor is always cancelled — even when
 * this row remounted mid-drag and the per-row refs below are empty.
 */
export const useFavoritePointerDragGuard = (dragEndedRef?: RefObject<boolean>) => {
  const pointerStartRef = useRef<PointerCoordinates | null>(null);
  const pointerDraggedRef = useRef(false);

  const onPointerDownCapture = useCallback((event: PointerCoordinates) => {
    pointerStartRef.current = { clientX: event.clientX, clientY: event.clientY };
    pointerDraggedRef.current = false;
  }, []);

  const onPointerMoveCapture = useCallback((event: PointerCoordinates) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= 5) {
      pointerDraggedRef.current = true;
    }
  }, []);

  const onClick = useCallback(
    (event: ClickCancellation) => {
      const start = pointerStartRef.current;
      const releasedAwayFromStart =
        !!start && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= 5;
      if (!pointerDraggedRef.current && !releasedAwayFromStart && !dragEndedRef?.current) return;
      event.preventDefault();
      event.stopPropagation();
      pointerDraggedRef.current = false;
    },
    [dragEndedRef],
  );

  return { onClick, onPointerDownCapture, onPointerMoveCapture };
};
