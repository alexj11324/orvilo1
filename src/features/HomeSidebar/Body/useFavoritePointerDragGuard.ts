import { useCallback, useRef } from 'react';

interface PointerCoordinates {
  clientX: number;
  clientY: number;
}

interface ClickCancellation extends PointerCoordinates {
  preventDefault: () => void;
  stopPropagation: () => void;
}

export const useFavoritePointerDragGuard = () => {
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

  const onClick = useCallback((event: ClickCancellation) => {
    const start = pointerStartRef.current;
    const releasedAwayFromStart =
      !!start && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= 5;
    if (!pointerDraggedRef.current && !releasedAwayFromStart) return;
    event.preventDefault();
    event.stopPropagation();
    pointerDraggedRef.current = false;
  }, []);

  return { onClick, onPointerDownCapture, onPointerMoveCapture };
};
