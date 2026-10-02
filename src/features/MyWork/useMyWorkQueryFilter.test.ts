import type { WorkQueryFilter } from '@orvilo/types';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stableStringify } from '@/features/SavedViews/workQueryBuilder';

import { useMyWorkQueryFilter } from './useMyWorkQueryFilter';

const BUILDER_FILTER: WorkQueryFilter = {
  all: [{ field: 'assigneeUserId', op: 'eq', value: 'u_1' }],
};

const VISIBILITY_FILTER: WorkQueryFilter = {
  all: [{ field: 'parentTaskId', op: 'isNull' }],
};

afterEach(() => vi.restoreAllMocks());

describe('useMyWorkQueryFilter', () => {
  it('keeps the serialized filter stable across rerenders (SWR key safety)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000);
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

  it('slides the completed window when a later render crosses an hour boundary', () => {
    const base = 1_760_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(base);
    const { result, rerender } = renderHook(() =>
      useMyWorkQueryFilter(BUILDER_FILTER, 'pastDay', VISIBILITY_FILTER),
    );
    const first = stableStringify(result.current);
    clock.mockReturnValue(base + 3_600_000);
    rerender();
    expect(stableStringify(result.current)).not.toBe(first);
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
