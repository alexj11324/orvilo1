'use client';

import { cn } from 'cn';
import { memo, useEffect, useState } from 'react';

import { type LayoutShiftEntry, sumLayoutShifts } from './metricUtils';

const styles = {
  high: 'text-destructive-text',
  mid: 'text-warning-text',
  text: 'font-mono text-xs leading-5 tabular-nums text-foreground-tertiary',
};

const ClsWidget = memo(() => {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    const Observer = globalThis.PerformanceObserver;
    if (!Observer?.supportedEntryTypes.includes('layout-shift')) return;

    setValue(0);
    const observer = new Observer((list) => {
      const shift = sumLayoutShifts(list.getEntries() as unknown as LayoutShiftEntry[]);
      if (shift > 0) setValue((current) => (current ?? 0) + shift);
    });
    observer.observe({ buffered: true, type: 'layout-shift' });

    return () => observer.disconnect();
  }, []);

  if (value === null) return null;

  return (
    <span
      className={cn(styles.text, value > 0.25 ? styles.high : value > 0.1 ? styles.mid : undefined)}
      title={'Cumulative Layout Shift (warning > 0.1, red > 0.25)'}
    >
      CLS {value.toFixed(3)}
    </span>
  );
});

ClsWidget.displayName = 'DevDockClsWidget';

export default ClsWidget;
