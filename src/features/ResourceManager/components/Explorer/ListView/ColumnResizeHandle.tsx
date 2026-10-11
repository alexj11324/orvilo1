'use client';

import { cn } from 'cn';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

interface ColumnResizeHandleProps {
  column: 'name' | 'date' | 'size' | 'uploader';
  currentWidth: number;
  maxWidth: number;
  minWidth: number;
  onResize: (width: number) => void;
}

const ColumnResizeHandle = memo<ColumnResizeHandleProps>(
  ({ currentWidth, minWidth, maxWidth, onResize }) => {
    const [isDragging, setIsDragging] = useState(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        const delta = e.clientX - startXRef.current;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + delta));

        // Update width in real-time during drag
        onResize(newWidth);
      },
      [minWidth, maxWidth, onResize],
    );

    const handleMouseUp = useCallback(() => {
      setIsDragging(false);
    }, []);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setIsDragging(true);
        startXRef.current = e.clientX;
        startWidthRef.current = currentWidth;
      },
      [currentWidth],
    );

    // Attach document-level event listeners when dragging
    useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Disable text selection and lock cursor during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        };
      }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
      <div
        className={cn(
          "cursor-col-resize select-none absolute z-1 inset-y-0 end-0 -translate-x-1 flex items-center justify-center w-4 after:content-[''] after:w-[1.5px] after:h-[calc(100%_-_16px)] after:rounded-full after:bg-border after:transition-[width,background-color] after:duration-200 after:ease-[ease] hover:after:w-0.75 hover:after:bg-primary",
          isDragging && 'after:w-0.75 after:bg-primary',
        )}
        onMouseDown={handleMouseDown}
      />
    );
  },
);

ColumnResizeHandle.displayName = 'ColumnResizeHandle';

export default ColumnResizeHandle;
