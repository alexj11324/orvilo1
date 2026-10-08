'use client';

import { memo } from 'react';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import { Skeleton } from '@/components/ui/skeleton';

interface PortalBodyStateProps {
  error?: unknown;
  isLoading: boolean;
  notFoundDesc: string;
  notFoundTitle: string;
  onRetry: () => void;
}

/**
 * The three non-content states of a portal body whose data is still missing:
 * a failed fetch (with Retry), a fetch in flight (a skeleton shaped like the
 * stacked sections the body renders), and a resolved miss. Follows
 * `TaskDetail/Body.tsx`, so a portal panel never stays blank.
 */
const PortalBodyState = memo<PortalBodyStateProps>(
  ({ error, isLoading, notFoundDesc, notFoundTitle, onRetry }) => {
    if (error) {
      return (
        <div className="flex flex-col flex-1 h-[100%]" style={{ minHeight: 0, overflowY: 'auto' }}>
          <AsyncError error={error} variant={'page'} onRetry={onRetry} />
        </div>
      );
    }

    if (isLoading) {
      return (
        <div aria-hidden className="flex flex-col flex-1 gap-3 p-4">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-2 h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 h-[100%]" style={{ minHeight: 0, overflowY: 'auto' }}>
        <NotFound desc={notFoundDesc} title={notFoundTitle} />
      </div>
    );
  },
);

PortalBodyState.displayName = 'PortalBodyState';

export default PortalBodyState;
