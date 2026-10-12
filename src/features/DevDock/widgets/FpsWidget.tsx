'use client';

import { cn } from 'cn';
import { memo, useEffect, useState } from 'react';

const styles = {
  low: 'text-destructive-text',
  mid: 'text-warning-text',
  text: 'font-mono text-xs leading-5 tabular-nums text-foreground-tertiary',
};

const FpsWidget = memo(() => {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();

    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (fps === null) return null;

  return (
    <span
      className={cn(styles.text, fps < 30 ? styles.low : fps < 50 ? styles.mid : undefined)}
      title={'Frames per second'}
    >
      {fps} FPS
    </span>
  );
});

FpsWidget.displayName = 'DevDockFpsWidget';

export default FpsWidget;
