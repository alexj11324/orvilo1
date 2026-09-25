/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MENU as ASSISTANT_DEFAULT_MENU } from '@/features/Conversation/Messages/Assistant/Actions';
import { DEFAULT_MENU as GROUP_DEFAULT_MENU } from '@/features/Conversation/Messages/AssistantGroup/Actions';

import { useActionsBarConfig } from './useActionsBarConfig';

const mocks = vi.hoisted(() => ({ isHeterogeneous: false }));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    isCurrentAgentHeterogeneous: () => mocks.isHeterogeneous,
  },
}));

describe('useActionsBarConfig', () => {
  beforeEach(() => {
    mocks.isHeterogeneous = false;
  });

  it('keeps the default assistant menus plus copyAsMarkdown after copy', () => {
    const { result } = renderHook(() => useActionsBarConfig());

    const menu = result.current.assistant?.menu;
    expect(menu).toBeDefined();

    // Default menu preserved verbatim except for the inserted action.
    const expected = ASSISTANT_DEFAULT_MENU.flatMap((slot) =>
      slot === 'copy' ? [slot, 'copyAsMarkdown'] : [slot],
    );
    expect(menu).toEqual(expected);
    expect(menu?.indexOf('copyAsMarkdown')).toBe(menu!.indexOf('copy') + 1);
  });

  it('extends the assistantGroup menu the same way', () => {
    const { result } = renderHook(() => useActionsBarConfig());

    const expected = GROUP_DEFAULT_MENU.flatMap((slot) =>
      slot === 'copy' ? [slot, 'copyAsMarkdown'] : [slot],
    );
    expect(result.current.assistantGroup?.menu).toEqual(expected);
  });

  it('leaves bars and the user menu untouched for native agents', () => {
    const { result } = renderHook(() => useActionsBarConfig());

    expect(result.current.assistant?.bar).toBeUndefined();
    expect(result.current.user).toBeUndefined();
  });

  it('adds copyAsMarkdown to the minimal hetero assistant menu', () => {
    mocks.isHeterogeneous = true;

    const { result } = renderHook(() => useActionsBarConfig());

    expect(result.current.assistant?.menu).toEqual([
      'copy',
      'copyAsMarkdown',
      'divider',
      'select',
      'divider',
      'del',
    ]);
    expect(result.current.assistantGroup?.menu).toEqual(result.current.assistant?.menu);
  });
});
