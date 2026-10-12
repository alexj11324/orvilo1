'use client';

import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

const styles = {
  detailContent: 'flex min-w-0 flex-wrap items-center gap-2',
  detailLabel: 'text-sm leading-5.5 text-muted-foreground',
  detailRow:
    'grid min-h-11 items-center gap-x-4 gap-y-1.5 py-2 [&+&]:border-bs [&+&]:border-divider @min-[35rem]:[&.has-label]:grid-cols-[minmax(8.75rem,11.25rem)_minmax(0,1fr)]',
  group: 'pbs-2 pbe-1 [&+&]:mbs-4',
  groupHeader: 'flex items-center justify-between gap-3 border-be border-divider pbe-2',
  hint: 'text-xs leading-5 text-foreground-description',
  select: 'min-w-55 max-w-full',
  title: 'text-base leading-6 font-semibold tracking-[0.04em] text-muted-foreground uppercase',
};

export const settingsStyles = styles;

interface SettingsGroupProps {
  action?: ReactNode;
  children: ReactNode;
  title: ReactNode;
}

/**
 * One section on the agent settings page — a small uppercase section label
 * over a hairline with `SettingsRow` rows beneath. Sections are plain stacks,
 * not cards: only special states (warning / error / blocked) draw a bordered
 * surface, via `Alert`.
 */
export const SettingsGroup = memo<SettingsGroupProps>(({ action, children, title }) => (
  <div className={styles.group}>
    <div className={styles.groupHeader}>
      <div className={styles.title}>{title}</div>
      {action}
    </div>
    {children}
  </div>
));

SettingsGroup.displayName = 'SettingsGroup';

interface SettingsRowProps {
  children: ReactNode;
  /** Left-hand row label; absent rows span the full width with no label column. */
  label?: ReactNode;
}

export const SettingsRow = memo<SettingsRowProps>(({ children, label }) => (
  <div className={cn(styles.detailRow, label ? 'has-label' : undefined)}>
    {label ? <div className={styles.detailLabel}>{label}</div> : null}
    <div className={styles.detailContent}>{children}</div>
  </div>
));

SettingsRow.displayName = 'SettingsRow';
