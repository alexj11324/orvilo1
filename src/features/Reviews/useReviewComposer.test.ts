import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useReviewComposer } from './useReviewComposer';

describe('useReviewComposer', () => {
  it('keeps a draft and unknown outcome across close and reopen, then isolates the next PR', async () => {
    const submit = vi.fn().mockResolvedValue('unknown');
    const verify = vi.fn().mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ reviewId }) => useReviewComposer(reviewId, submit, verify),
      { initialProps: { reviewId: 'pr-1' } },
    );

    act(() => {
      result.current.setOpen(true);
      result.current.setBody('Please check this change');
    });
    await act(async () => {
      await result.current.submit('COMMENT', 'Please check this change');
    });
    expect(result.current.unknownIntent).toEqual({
      body: 'Please check this change',
      event: 'COMMENT',
    });

    act(() => result.current.setOpen(false));
    act(() => result.current.setOpen(true));
    expect(result.current.body).toBe('Please check this change');
    expect(result.current.unknownIntent).not.toBeNull();

    rerender({ reviewId: 'pr-2' });
    expect(result.current.body).toBe('');
    expect(result.current.unknownIntent).toBeNull();
    expect(result.current.open).toBe(false);
  });
});
