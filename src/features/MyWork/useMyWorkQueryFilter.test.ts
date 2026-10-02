import type { WorkQueryFilter } from '@orvilo/types';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { stableStringify } from '@/features/SavedViews/workQueryBuilder';

import { useMyWorkQueryFilter } from './useMyWorkQueryFilter';

const BUILDER_FILTER: WorkQueryFilter = {
  all: [{ field: 'assigneeUserId', op: 'eq', value: 'u_1' }],
};

const VISIBILITY_FILTER: WorkQueryFilter = {
  all: [{ field: 'parentTaskId', op: 'isNull' }],
};

describe('useMyWorkQueryFilter', () => {
  it('keeps the serialized filter stable across rerenders (SWR key safety)', async () => {
    const { result, rerender } = renderHook(
      ({ completed }) => useMyWorkQueryFilter(BUILDER_FILTER, completed, VISIBILITY_FILTER),
      { initialProps: { completed: 'pastDay' as const } },
    );

    const first = stableStringify(result.current);
    // The completed window stamps Date.now() when evaluated — any recompute on
    // an unrelated rerender changes the serialized filter and churns the SWR key.
    await new Promise((resolve) => setTimeout(resolve, 5));
    rerender({ completed: 'pastDay' });
    rerender({ completed: 'pastDay' });
    expect(stableStringify(result.current)).toBe(first);
  });

  it('recomputes when the completed window changes', () => {
    const { result, rerender } = renderHook(
      ({ completed }) => useMyWorkQueryFilter(BUILDER_FILTER, completed, VISIBILITY_FILTER),
      { initialProps: { completed: 'pastDay' as const } },
    );
    const first = stableStringify(result.current);
    rerender({ completed: 'none' });
    expect(stableStringify(result.current)).not.toBe(first);
  });
});
