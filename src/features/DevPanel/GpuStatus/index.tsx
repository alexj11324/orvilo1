'use client';

import type { GpuStatus } from '@orvilo/electron-client-ipc';
import { cn } from 'cn';
import { Fragment, memo, useEffect, useState } from 'react';

import { devDockPanelStyles } from '@/features/DevDock/panelStyles';
import { electronDevtoolsService } from '@/services/electron/devtools';

const styles = {
  device:
    'grid grid-cols-[96px_1fr] shrink-0 gap-y-1 gap-x-2 py-2.5 px-3 border-b border-divider font-mono text-xs leading-5 text-muted-foreground',
  empty: 'p-6 text-sm leading-5.5 text-foreground-tertiary text-center',
  error: 'text-destructive-text',
  key: 'text-foreground-quaternary',
  legend:
    'shrink-0 pt-2 pb-3 px-3 border-t border-divider text-xs leading-5 text-foreground-quaternary',
  muted: 'text-foreground-tertiary',
  ok: 'text-success-text',
  rows: 'overflow-auto flex-1 min-h-0',
  row: 'grid grid-cols-[1fr_200px] gap-2 items-center py-1.5 px-3 border-b border-divider font-mono text-xs leading-5',
  value: 'wrap-anywhere',
  warn: 'text-warning-text',
};

const statusClass = (status: string): string => {
  if (status.startsWith('enabled')) return styles.ok;
  if (status.includes('software')) return styles.warn;
  if (status.endsWith('_ok')) return styles.muted;
  return styles.error;
};

const DEVICE_LABELS: [label: string, key: keyof Omit<GpuStatus, 'featureStatus'>][] = [
  ['renderer', 'renderer'],
  ['vendor', 'vendor'],
  ['gl version', 'version'],
  ['display', 'displayType'],
  ['skia', 'skiaBackend'],
  ['machine', 'machineModel'],
];

const GpuStatusPanel = memo(() => {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    electronDevtoolsService
      .getGpuStatus()
      .then((next) => {
        if (!disposed) setStatus(next);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  if (failed)
    return (
      <div className={devDockPanelStyles.root}>
        <div className={styles.empty}>GPU status unavailable over ipc.</div>
      </div>
    );
  if (!status) return null;

  const features = Object.entries(status.featureStatus).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className={cn(devDockPanelStyles.root, 'flex flex-col')}>
      <div className={styles.device}>
        {DEVICE_LABELS.map(([label, key]) => (
          <Fragment key={key}>
            <span className={styles.key}>{label}</span>
            <span className={cn(styles.value, !status[key] && styles.muted)}>
              {status[key] ?? '—'}
            </span>
          </Fragment>
        ))}
      </div>
      <div className={styles.rows}>
        {features.map(([feature, value]) => (
          <div className={styles.row} key={feature}>
            <span className={styles.muted}>{feature}</span>
            <span className={statusClass(value)}>{value}</span>
          </div>
        ))}
      </div>
      <div className={styles.legend}>
        `enabled_*` runs on the GPU, `*_software` fell back to the CPU renderer, `*_off_ok` is
        switched off by design, and anything else is a hard disable worth investigating on
        chrome://gpu. Read once when the panel opens — reopen it to re-sample.
      </div>
    </div>
  );
});

GpuStatusPanel.displayName = 'DevGpuStatusPanel';

export default GpuStatusPanel;
