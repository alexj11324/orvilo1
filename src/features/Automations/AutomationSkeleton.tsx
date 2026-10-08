import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

// The grid templates, paddings and 24px trailing control mirror `row` /
// `headerRow` in AutomationScheduleList.tsx and AutomationRunsPage.tsx, so the
// load -> content swap keeps the same row height and column positions.
const styles = createStaticStyles(({ css, cssVar }) => ({
  headerRow: css`
    display: grid;
    gap: 12px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  row: css`
    display: grid;
    gap: 12px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 8px;
  `,
  runs: css`
    grid-template-columns: minmax(0, 2fr) 90px 130px 120px 70px 40px;
  `,
  schedule: css`
    grid-template-columns: 28px minmax(0, 2fr) 130px 110px minmax(0, 1.4fr) 110px 40px;
  `,
}));

const ROWS = 6;

/** Placeholder for the Automation run history table. */
export const AutomationRunsSkeleton = memo(() => (
  <div aria-hidden>
    <div className={`${styles.headerRow} ${styles.runs}`}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-3 w-10" />
      <span />
    </div>
    {Array.from({ length: ROWS }, (_, index) => (
      <div className={`${styles.row} ${styles.runs}`} key={index}>
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-3 w-10" />
        <Skeleton className="size-6" />
      </div>
    ))}
  </div>
));

AutomationRunsSkeleton.displayName = 'AutomationRunsSkeleton';

/** Placeholder for the scheduled-automation table (also embedded in the Issues page). */
export const AutomationScheduleSkeleton = memo(() => (
  <div aria-hidden>
    <div className={`${styles.headerRow} ${styles.schedule}`}>
      <span />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-3 w-16" />
      <span />
    </div>
    {Array.from({ length: ROWS }, (_, index) => (
      <div className={`${styles.row} ${styles.schedule}`} key={index}>
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="size-6" />
      </div>
    ))}
  </div>
));

AutomationScheduleSkeleton.displayName = 'AutomationScheduleSkeleton';
