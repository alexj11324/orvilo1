import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useBasicSettingsDraft } from './useBasicSettingsDraft';

describe('useBasicSettingsDraft', () => {
  it('preserves an unsaved name and instructions when another group field refreshes', () => {
    const { result, rerender } = renderHook(
      ({ title, content }) => useBasicSettingsDraft(title, content),
      { initialProps: { content: 'Saved instructions', title: 'Saved group' } },
    );
    act(() => result.current.setDraft({ content: 'Retry these instructions', title: 'My draft' }));
    rerender({ content: 'Remote instructions', title: 'Remote group' });
    expect(result.current.draft).toEqual({
      content: 'Retry these instructions',
      title: 'My draft',
    });
    expect(result.current.dirty).toBe(true);
    // The successful retry's refreshed values acknowledge the exact draft.
    rerender({ content: 'Retry these instructions', title: 'My draft' });
    expect(result.current.dirty).toBe(false);
  });

  it('accepts remote updates for fields the user has not changed', () => {
    const { result, rerender } = renderHook(
      ({ title, content }) => useBasicSettingsDraft(title, content),
      { initialProps: { content: 'Saved instructions', title: 'Saved group' } },
    );
    act(() => result.current.setDraft((draft) => ({ ...draft, title: 'My draft' })));
    rerender({ content: 'Remote instructions', title: 'Remote group' });
    expect(result.current.draft).toEqual({ content: 'Remote instructions', title: 'My draft' });
  });
});
