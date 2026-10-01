'use client';

import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

interface ListSkeletonProps {
  /**
   * Inline padding of each placeholder row — match whatever the real row uses
   * so loading → loaded is a content swap, not a relayout (ux §4.1).
   */
  paddingInline?: number;
  rows?: number;
}

/**
 * Placeholder for a list of icon + title + subtitle rows (devices, credentials,
 * …). Skeletonises only the row text and leaves the surrounding card chrome to
 * the caller, so the list keeps its shape while the fetch is in flight.
 */
const ListSkeleton = memo<ListSkeletonProps>(({ paddingInline = 12, rows = 4 }) => (
  <div className={'flex flex-col'} style={{ gap: 2, width: '100%' }}>
    {Array.from({ length: rows }, (_, index) => (
      <div
        className={'flex gap-4 items-center'}
        key={index}
        style={{ paddingBlock: 12, paddingInline }}
      >
        <Skeleton className={'size-12 rounded-md'} />
        <div className={'flex flex-col gap-2 flex-1'}>
          <Skeleton style={{ height: 14, width: 140 }} />
          <Skeleton style={{ height: 12, width: 200 }} />
        </div>
      </div>
    ))}
  </div>
));

ListSkeleton.displayName = 'ListSkeleton';

export default ListSkeleton;
