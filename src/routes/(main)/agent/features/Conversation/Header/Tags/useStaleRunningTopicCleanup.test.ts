import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStaleRunningTopicCleanup } from './useStaleRunningTopicCleanup';

const mocks = vi.hoisted(() => ({ cleanupStaleRunningTopics: vi.fn() }));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({ cleanupStaleRunningTopics: mocks.cleanupStaleRunningTopics }),
}));

describe('useStaleRunningTopicCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retires stale running topics once on mount, not on re-render', () => {
    const { rerender } = renderHook(() => useStaleRunningTopicCleanup());
    rerender();

    expect(mocks.cleanupStaleRunningTopics).toHaveBeenCalledOnce();
  });
});
