import type { WorkQueryFilter } from '@orvilo/types';
import { useMemo } from 'react';

import { completedWindowQueryFilter, type MyWorkCompletedWindow } from './myWorkDisplay';
import { mergeWorkQueryFilters } from './myWorkFilters';

/**
 * The merged `filter` payload for the myWork feed.
 *
 * `completedWindowQueryFilter` stamps `Date.now()` at evaluation time, so the
 * merge MUST stay memoized: rebuilt per render it mints a new serialized SWR
 * key every frame, the feed re-fetches in a loop, and `isLoading` never
 * settles (the error branch can never stick because each key starts fresh).
 */
export const useMyWorkQueryFilter = (
  builderFilter: WorkQueryFilter | undefined,
  completed: MyWorkCompletedWindow,
  visibilityFilter: WorkQueryFilter | undefined,
): WorkQueryFilter | undefined =>
  useMemo(
    () =>
      mergeWorkQueryFilters(
        mergeWorkQueryFilters(builderFilter, completedWindowQueryFilter(completed)),
        visibilityFilter,
      ),
    [builderFilter, completed, visibilityFilter],
  );
