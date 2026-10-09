'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { type ReactNode } from 'react';
import { memo } from 'react';

import { type GroupBy } from './index';

const styles = createStaticStyles(({ css, cssVar }) => ({
  itemWrapper: css`
    position: relative;
    padding-inline-start: 24px;
  `,
  periodHeader: css`
    position: sticky;
    z-index: 10;
    inset-block-start: 0;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  timelineDot: css`
    position: absolute;
    inset-block-start: 20px;
    inset-inline-start: 0;

    width: 16px;
    height: 16px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 50%;

    background: ${cssVar.colorBgElevated};
    box-shadow: 0 2px 4px -2px rgb(0 0 0 / 40%);
  `,
}));

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
