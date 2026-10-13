'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { type ReactNode } from 'react';
import { memo } from 'react';

import { type GroupBy } from './index';

const styles = {
  itemWrapper: 'relative ps-6',
  periodHeader: 'sticky z-10 inset-bs-0 text-sm text-muted-foreground bg-card',
  timelineDot:
    'absolute inset-bs-5 inset-s-0 size-4 rounded-full border border-border bg-popover ring-2 ring-divider',
};

interface PeriodHeaderProps {
  groupBy?: GroupBy;

  periodKey: string;
}

export const PeriodHeader = memo<PeriodHeaderProps>(({ periodKey, groupBy = 'day' }) => {
  const periodName =
    groupBy === 'month'
      ? dayjs(`${periodKey}-01`).format('MMMM YYYY')
      : formatAbsoluteDate(periodKey);

  return (
    <div className={cn('flex items-center gap-3 py-2', styles.periodHeader)}>
      <div className="font-medium">{periodName}</div>
    </div>
  );
});

interface TimelineItemWrapperProps {
  children: ReactNode;
}

export const TimelineItemWrapper = memo<TimelineItemWrapperProps>(({ children }) => {
  return (
    <div className={styles.itemWrapper}>
      <div className={styles.timelineDot} />
      {children}
    </div>
  );
});
