'use client';

import { cn } from 'cn';
import { memo } from 'react';

import { useAppProcessMetrics } from './appProcessMetrics';

const styles = {
  high: 'text-destructive-text',
  mid: 'text-warning-text',
  text: 'font-mono text-xs leading-5 tabular-nums text-foreground-tertiary',
};

const GpuProcessWidget = memo(() => {
  const gpu = useAppProcessMetrics()?.gpu;

  if (!gpu) return null;

  return (
    <span
      className={cn(
        styles.text,
        gpu.cpuPercent >= 100 ? styles.high : gpu.cpuPercent >= 50 ? styles.mid : undefined,
      )}
      title={
        'GPU process CPU usage and resident memory — Chromium exposes no GPU utilisation figure'
      }
    >
      GPU {gpu.cpuPercent.toFixed(1)}% · {Math.round(gpu.memoryMB)}M
    </span>
  );
});

GpuProcessWidget.displayName = 'DevDockGpuProcessWidget';

export default GpuProcessWidget;
