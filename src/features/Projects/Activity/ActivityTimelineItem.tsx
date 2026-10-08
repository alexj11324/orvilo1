import type { ReactNode } from 'react';

import {
  TimelineContent,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from '@/components/reui/timeline';

/*
 * ReUI's Timeline sizes its indicator for a 16px dot and tints the rail with
 * `primary`. The feed uses a 28px bordered slot (one 14px mark inside) with a
 * neutral rail, so the slot, the rail's start and its length are re-stated
 * here once instead of at every call site. `ms-10` + `-left-[26px]` keep the
 * slot flush with the timeline's left edge and 12px from the text.
 */
const ITEM =
  'group-data-[orientation=vertical]/timeline:ms-10 group-data-[orientation=vertical]/timeline:not-last:pb-4';
const INDICATOR =
  'flex size-7 items-center justify-center overflow-hidden border border-border bg-background text-muted-foreground group-data-[orientation=vertical]/timeline:-left-[26px]';
const SEPARATOR =
  'bg-border group-data-[orientation=vertical]/timeline:-left-[26px] group-data-[orientation=vertical]/timeline:h-[calc(100%-2rem)] group-data-[orientation=vertical]/timeline:translate-y-[30px]';

interface ActivityTimelineItemProps {
  children: ReactNode;
  /** Pad the first text line so it centers on the 28px slot (inline sentences). */
  inline?: boolean;
  /** The line's single leading mark. */
  marker: ReactNode;
  /** 1-based position; Timeline requires it, the feed never marks steps complete. */
  step: number;
}

export const ActivityTimelineItem = ({
  children,
  inline = true,
  marker,
  step,
}: ActivityTimelineItemProps) => (
  <TimelineItem className={ITEM} step={step}>
    <TimelineIndicator className={INDICATOR}>{marker}</TimelineIndicator>
    <TimelineSeparator className={SEPARATOR} />
    <TimelineContent
      className={
        inline
          ? 'pt-[3px] text-sm leading-[22px] text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground'
          : undefined
      }
    >
      {children}
    </TimelineContent>
  </TimelineItem>
);
