'use client';

import { cn } from 'cn';
import { memo } from 'react';

import { useAppProcessMetrics } from './appProcessMetrics';

const styles = {
  high: 'text-destructive-text',
  mid: 'text-warning-text',
  text: 'font-mono text-xs leading-5 tabular-nums text-foreground-tertiary',
};

const CpuUsageWidget = memo(() => {
  const metrics = useAppProcessMetrics();

  if (!metrics) return null;

  const percent = metrics.cpuPercent;

  return (
    <span
      title={'App CPU usage (sum across processes, 100% = one core)'}
      className={cn(
        styles.text,
        percent >= 200 ? styles.high : percent >= 100 ? styles.mid : undefined,
      )}
    >
      CPU {percent.toFixed(1)}%
    </span>
  );
});

CpuUsageWidget.displayName = 'DevDockCpuUsageWidget';

export default CpuUsageWidget;
