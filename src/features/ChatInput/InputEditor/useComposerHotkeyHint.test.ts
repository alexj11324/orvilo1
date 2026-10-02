import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useComposerHotkeyHint } from './useComposerHotkeyHint';

const serverConfig = vi.hoisted(() => ({
  isMobile: false,
}));

vi.mock('@/store/serverConfig', () => ({
  useServerConfigStore: (selector: (state: { isMobile: boolean }) => unknown) =>
    selector(serverConfig),
}));

describe('useComposerHotkeyHint', () => {
  it('keeps the send-shortcut hint on desktop', () => {
    serverConfig.isMobile = false;
    const { result } = renderHook(() => useComposerHotkeyHint());

    expect(result.current).toBe(true);
  });

  it('hides the send-shortcut hint on mobile', () => {
    serverConfig.isMobile = true;
    const { result } = renderHook(() => useComposerHotkeyHint());

    expect(result.current).toBe(false);
  });
});
