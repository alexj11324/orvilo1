import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createNativeBrowserEditor } from './session';
import { useNativeEditable } from './useNativeEditable';

const createKernel = () =>
  createNativeBrowserEditor(
    () => ({
      code: () => null,
      math: () => null,
      mention: () => null,
      linkCard: () => null,
      linkIframe: () => null,
      linkSchema: () => null,
    }),
    () => ({ decorator: () => null, handleUpload: async () => ({ url: '/file' }), theme: {} }),
    () => ({
      defaultBlockImage: true,
      getImageWidth: async () => 100,
      handleUpload: async () => ({ url: '/image' }),
      handleRehost: async (url: string) => ({ url }),
      needRehost: () => false,
      render: () => null,
    }),
  );

describe('actual native browser composition', () => {
  it('retains both table controller decorators through the real host factory', () => {
    const kernel = createKernel();
    try {
      kernel.initNodeEditor();
      kernel.setDocument('markdown', '| A | B |\n| --- | --- |\n| C | D |');
      expect(kernel.getDocument('markdown')).toMatch(/\| A\s+\| B\s+\|/u);
      expect(kernel.getDecorator('table')).toMatchObject({
        multi: [
          { queryDOM: expect.any(Function), render: expect.any(Function) },
          { queryDOM: expect.any(Function), render: expect.any(Function) },
        ],
      });
    } finally {
      kernel.destroy();
    }
  });

  it('tracks real kernel permission changes after initial read-only hydration', () => {
    const kernel = createKernel();
    kernel.initNodeEditor();
    kernel.setEditable(false);
    const { result, unmount } = renderHook(() => useNativeEditable(kernel));
    try {
      expect(result.current).toBe(false);
      act(() => kernel.setEditable(true));
      expect(result.current).toBe(true);
      act(() => kernel.setEditable(false));
      expect(result.current).toBe(false);
    } finally {
      unmount();
      kernel.destroy();
    }
  });
});
