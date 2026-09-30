'use client';

import { cn } from 'cn';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Badge } from '@/components/reui/badge';
import StreamingMarkdown from '@/components/StreamingMarkdown';

import type { AddActivityMemoryParams } from '../../types';
import { getActivityMemoryViewModel } from './activityMemoryViewModel';
import {
  EntityChips,
  memoryCardStyles as styles,
  MemorySection,
  SummaryAccordion,
} from './MemoryCardParts';

/**
 * Activity lifecycle values mapped to semantic tag colors, so an activity reads as
 * done / planned / dropped at a glance instead of as another neutral label.
 */
const STATUS_COLORS: Record<string, string> = {
  cancelled: 'default',
  completed: 'success',
  on_hold: 'warning',
  ongoing: 'info',
  pending: 'warning',
  planned: 'default',
};

export interface ActivityMemoryCardProps {
  data?: AddActivityMemoryParams;
  loading?: boolean;
}

export const ActivityMemoryCard = memo<ActivityMemoryCardProps>(({ data, loading }) => {
  const {
    activityType,
    details,
    entities,
    feedback,
    hasActivityContent,
    isEmpty,
    narrative,
    notes,
    schedule,
    status,
    summary,
    tags,
    timezone,
    title,
  } = getActivityMemoryViewModel(data);

  if (isEmpty) return null;

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <div className="flex flex-col flex-1">
          <div className={styles.title}>{title || 'Activity Memory'}</div>
        </div>
        {activityType && <Badge>{activityType}</Badge>}
        {status && (
          <Badge
            style={{
              color: STATUS_COLORS[status] || 'default',
              borderColor: STATUS_COLORS[status] || 'default',
            }}
          >
            {status.replace('_', ' ')}
          </Badge>
        )}
        {loading && <NeuralNetworkLoading size={20} />}
      </div>

      {hasActivityContent ? (
        <>
          <SummaryAccordion details={details} summary={summary} tags={tags} />

          {/* When it happened — the anchor an episodic memory is recalled by */}
          {schedule && (
            <div
              className={cn('flex', 'items-center', 'gap-2', styles.section)}
              style={{ paddingBlock: 12, paddingInline: 12 }}
            >
              <span>🕒</span>
              <div className="text-[13px]">{schedule}</div>
              {timezone && <div className="text-[12px] text-muted-foreground">{timezone}</div>}
            </div>
          )}

          {narrative && (
            <MemorySection title={'What happened'}>
              <div className={styles.sectionBody}>
                <StreamingMarkdown>{narrative}</StreamingMarkdown>
              </div>
            </MemorySection>
          )}

          {entities.length > 0 && (
            <MemorySection title={'Involved'} tone={'info'}>
              <EntityChips entities={entities} />
            </MemorySection>
          )}

          {notes && (
            <MemorySection title={'Notes'} tone={'info'}>
              <div className={styles.detail}>{notes}</div>
            </MemorySection>
          )}

          {feedback && (
            <MemorySection title={'How it felt'} tone={'gold'}>
              <div className={styles.sectionBody}>{feedback}</div>
            </MemorySection>
          )}
        </>
      ) : (
        <div className={cn('flex', 'flex-col', 'gap-2', styles.content)}>
          {!summary && loading ? (
            <BubblesLoading />
          ) : (
            <>
              {summary && <div className={styles.summary}>{summary}</div>}
              {details && <StreamingMarkdown>{details}</StreamingMarkdown>}
              {tags.length > 0 && (
                <div className={cn('flex', 'gap-2', 'flex-wrap', styles.tags)}>
                  {tags.map((tag, index) => (
                    <Badge key={index}>{tag}</Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

ActivityMemoryCard.displayName = 'ActivityMemoryCard';

export default ActivityMemoryCard;
