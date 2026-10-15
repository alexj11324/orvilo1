import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

interface UseSheetDragOptions {
  enabled: boolean;
  onDragChange: (draggedDistance: number) => void;
  onDragEnd: (draggedDistance: number, velocity: number) => void;
}

/** Vertical mouse drag on the sheet header; distances are positive upward. */
export const useSheetDrag = ({ enabled, onDragChange, onDragEnd }: UseSheetDragOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startTime = useRef(0);
  const onDragChangeRef = useRef(onDragChange);
  const onDragEndRef = useRef(onDragEnd);
  onDragChangeRef.current = onDragChange;
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (event: globalThis.MouseEvent) => {
      event.preventDefault();
      onDragChangeRef.current(startY.current - event.clientY);
    };
    const onMouseUp = (event: globalThis.MouseEvent) => {
      setIsDragging(false);
      const draggedDistance = startY.current - event.clientY;
      const elapsed = Date.now() - startTime.current;
      onDragEndRef.current(draggedDistance, elapsed > 0 ? Math.abs(draggedDistance) / elapsed : 0);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  const onMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      if ((event.target as HTMLElement).closest?.('[data-no-drag]')) return;
      event.preventDefault();
      startY.current = event.clientY;
      startTime.current = Date.now();
      setIsDragging(true);
    },
    [enabled],
  );

  return { handleProps: { onMouseDown }, isDragging };
};
