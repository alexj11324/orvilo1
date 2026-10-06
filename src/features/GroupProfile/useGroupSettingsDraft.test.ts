import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useGroupSettingsDraft } from './useGroupSettingsDraft';

describe('independent group settings drafts', () => {
  it('retains coordinator edits when the saved opening changes', () => {
    const coordinator = { model: 'saved-model', systemRole: 'Saved instructions' };
    const { result, rerender } = renderHook(
      ({ opening, coordinator }) => useGroupSettingsDraft(coordinator, opening),
      { initialProps: { opening: 'Saved opening', coordinator } },
    );
    act(() => {
      result.current.setPrompt('Draft instructions');
      result.current.setRuntime({ model: 'draft-model' });
    });
    rerender({ opening: 'Updated opening', coordinator: { ...coordinator } });
    expect(result.current.prompt).toBe('Draft instructions');
    expect(result.current.runtime?.model).toBe('draft-model');
    expect(result.current.opening).toBe('Updated opening');
  });

  it('retains opening edits when the saved coordinator changes', () => {
    const questions = ['Saved question'];
    const { result, rerender } = renderHook(
      ({ coordinator }) => useGroupSettingsDraft(coordinator, 'Saved opening', questions),
      { initialProps: { coordinator: { model: 'saved-model' } } },
    );
    act(() => {
      result.current.setOpening('Draft opening');
      result.current.setQuestions('Draft question');
    });
    rerender({ coordinator: { model: 'updated-model' } });
    expect(result.current.opening).toBe('Draft opening');
    expect(result.current.questions).toBe('Draft question');
  });
});
