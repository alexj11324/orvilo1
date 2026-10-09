import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWhileMounted } from './useWhileMounted';

describe('useWhileMounted', () => {
  it('forwards calls while mounted and drops them after unmount', () => {
    const onChange = vi.fn();
    const { result, unmount } = renderHook(() => useWhileMounted(onChange));

    result.current('draft');
    expect(onChange).toHaveBeenCalledWith('draft');

    unmount();
    result.current('stale');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
