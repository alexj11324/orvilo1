import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkspaceSlug } from './useWorkspaceSlug';

describe('useWorkspaceSlug', () => {
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
