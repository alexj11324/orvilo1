import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkspaceSlug } from './useWorkspaceSlug';

describe('useWorkspaceSlug', () => {
  it.each([
    ['a'.repeat(32), undefined],
    ['a'.repeat(33), 'invalidLength'],
    ['public-release-acceptance-20261004', 'invalidLength'],
    ['ab', 'invalidLength'],
    ['abc', undefined],
    ['invalid slug', 'invalidPattern'],
    ['', undefined],
  ] satisfies [string, 'invalidLength' | 'invalidPattern' | undefined][])(
    'validates a manual workspace URL before continuing (%s)',
    (slug, error) => {
      const { result } = renderHook(() => useWorkspaceSlug('My Workspace'));
      act(() => result.current.onWorkspaceSlugChange(slug));
      expect(result.current.workspaceSlugError).toBe(error);
    },
  );

  it('rejects a resumed overlong URL and clears the error when corrected', () => {
    const { result } = renderHook(() =>
      useWorkspaceSlug('My Workspace', 'public-release-acceptance-20261004'),
    );
    expect(result.current.workspaceSlugError).toBe('invalidLength');
    act(() => result.current.onWorkspaceSlugChange('public-release-acceptance'));
    expect(result.current.workspaceSlugError).toBeUndefined();
  });

  it('resumes the checkpointed workspace name and custom slug', () => {
    const { result } = renderHook(() => useWorkspaceSlug('Saved Team', 'saved-custom-url'));
    expect(result.current.workspaceName).toBe('Saved Team');
    expect(result.current.workspaceSlug).toBe('saved-custom-url');
    act(() => result.current.onWorkspaceNameChange('Updated Team'));
    expect(result.current.workspaceSlug).toBe('saved-custom-url');
  });
  it('derives the slug from the workspace name while typing', () => {
    const { result } = renderHook(() => useWorkspaceSlug());

    act(() => result.current.onWorkspaceNameChange('My Team'));
    expect(result.current.workspaceSlug).toBe('my-team');

    act(() => result.current.onWorkspaceNameChange('My Team Pro'));
    expect(result.current.workspaceSlug).toBe('my-team-pro');
  });

  it('stops auto-filling once the user edits the slug, resumes when cleared', () => {
    const { result } = renderHook(() => useWorkspaceSlug());

    act(() => result.current.onWorkspaceNameChange('My Team'));
    act(() => result.current.onWorkspaceSlugChange('custom-slug'));
    act(() => result.current.onWorkspaceNameChange('Renamed Team'));
    expect(result.current.workspaceSlug).toBe('custom-slug');

    act(() => result.current.onWorkspaceSlugChange(''));
    act(() => result.current.onWorkspaceNameChange('Renamed Team Again'));
    expect(result.current.workspaceSlug).toBe('renamed-team-again');
  });

  it('leaves the slug empty when the name has no usable characters', () => {
    const { result } = renderHook(() => useWorkspaceSlug());

    act(() => result.current.onWorkspaceNameChange('工作区'));
    expect(result.current.workspaceSlug).toBe('');
  });
});
