'use client';

import { cn } from 'cn';
import type { TargetIcon } from 'lucide-react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  Clock3Icon,
  LoaderCircleIcon,
  PauseCircleIcon,
  RefreshCwIcon,
  StampIcon,
} from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { GoalTaskPhase } from './goalTaskProgress';

const PHASE_META = {
  achieved: { color: 'var(--success-text)', icon: CheckCircle2Icon, spin: false },
  canceled: { color: 'var(--foreground-tertiary)', icon: CircleSlashIcon, spin: false },
  error: { color: 'var(--destructive-text)', icon: AlertTriangleIcon, spin: false },
  paused: { color: 'var(--foreground-tertiary)', icon: PauseCircleIcon, spin: false },
  repairing: { color: 'var(--warning-text)', icon: RefreshCwIcon, spin: true },
  review: { color: 'var(--warning-text)', icon: StampIcon, spin: false },
  running: { color: 'var(--info-text)', icon: LoaderCircleIcon, spin: true },
  verifying: { color: 'var(--info-text)', icon: LoaderCircleIcon, spin: true },
  waiting: { color: 'var(--muted-foreground)', icon: Clock3Icon, spin: false },
} as const satisfies Record<
  GoalTaskPhase,
  { color: string; icon: typeof TargetIcon; spin: boolean }
>;

const styles = {
  progress: 'overflow-hidden w-18 h-0.75 rounded-full bg-selected',
  progressFill:
    'h-full rounded-[inherit] bg-success transition-[width] duration-(--orvilo-motion-mid) ease-[ease]',
  status: 'text-xs text-foreground-tertiary',
  statusIcon: 'shrink-0 size-4',
};

export interface GoalStatusLineProps {
  passed: number;
  phase: GoalTaskPhase;
  progress: number;
  total: number;
}

/**
 * The live Goal status line — phase icon + round budget + acceptance coverage.
 * Shared by the running tracker card and the merged task-callback header.
 * Once the goal is achieved the coverage bar retires: "已达成" already implies
 * full coverage, so repeating "4/4 项通过" is noise.
 */
const GoalStatusLine = memo<GoalStatusLineProps>(({ passed, phase, progress, total }) => {
  const { t } = useTranslation('chat');
  const meta = PHASE_META[phase];
  const showChecks = total > 0 && phase !== 'achieved';

  return (
    <div className="flex items-center gap-1.5">
      {phase !== 'running' && (
        <>
          <meta.icon
            className={cn(styles.statusIcon, meta.spin ? 'animate-spin' : undefined)}
            color={meta.color}
            size={16}
          />
          <div className={styles.status}>{t(`goalTask.status.${phase}`)}</div>
          <div className={styles.status}>·</div>
        </>
      )}
      {showChecks && (
        <>
          <div className={styles.progress}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.status}>{t('goalTask.tasksDone', { passed, total })}</div>
        </>
      )}
    </div>
  );
});

GoalStatusLine.displayName = 'GoalStatusLine';

export default GoalStatusLine;
