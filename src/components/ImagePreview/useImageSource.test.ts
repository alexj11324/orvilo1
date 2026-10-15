import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useImageSource } from './useImageSource';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stubObjectUrls = () => {
  const create = vi.fn<(source: Blob) => string>();
  const revoke = vi.fn<(source: string) => void>();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  return { create, revoke };
};

describe('native image Blob source ownership', () => {
  it('preserves strings without allocating a URL', () => {
    const { create } = stubObjectUrls();
    const { result } = renderHook(() => useImageSource('/image.png'));
    expect(result.current).toBe('/image.png');
    expect(create).not.toHaveBeenCalled();
  });
  it('revokes replaced and unmounted Blob URLs while preserving the current source', () => {
    const { create, revoke } = stubObjectUrls();
    create.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const first = new Blob(['first']);
    const second = new Blob(['second']);
    const { result, rerender, unmount } = renderHook(({ source }) => useImageSource(source), {
      initialProps: { source: first },
    });
    expect(result.current).toBe('blob:first');
    act(() => rerender({ source: second }));
    expect(result.current).toBe('blob:second');
    expect(revoke).toHaveBeenCalledWith('blob:first');
    expect(create).toHaveBeenCalledWith(second);
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:second');
  });
});
