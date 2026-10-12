'use client';

import { TriangleAlert } from 'lucide-react';
import { createElement, type CSSProperties, memo } from 'react';

interface SilentFallbackProps {
  minHeight?: number;
  style?: CSSProperties;
}

const SilentFallback = memo<SilentFallbackProps>(({ minHeight = 36, style }) => {
  return (
    <div
      className="flex items-center justify-center gap-1 rounded-(--radius-card) border border-dashed border-divider text-xs leading-5 text-foreground-quaternary"
      style={{ minHeight, ...style }}
    >
      {createElement(TriangleAlert, { size: 16 })}
      <span>Render Error</span>
    </div>
  );
});

SilentFallback.displayName = 'SilentFallback';

export default SilentFallback;
