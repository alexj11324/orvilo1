import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getActiveWorkspaceId,
  useActiveWorkspaceId,
} from './hooks/useActiveWorkspaceId';
import {
  getActiveWorkspaceSlug,
  useActiveWorkspaceSlug,
} from './hooks/useActiveWorkspaceSlug';
import { getBusinessTrpcHeaders } from './trpc-headers';
import {
  getWorkspaceContextState,
  useWorkspaceContextStore,
} from './workspaceContextStore';

beforeEach(() => {
  getWorkspaceContextState().setActiveWorkspace(null);
});

describe('workspaceContextStore', () => {
  it('starts in personal mode', () => {
    expect(getActiveWorkspaceId()).toBeNull();
    expect(getActiveWorkspaceSlug()).toBeNull();
  });

  it('stores id and slug together and clears them together', () => {
    act(() => {
      getWorkspaceContextState().setActiveWorkspace({ id: 'ws-1', slug: 'acme' });
    });
    expect(getActiveWorkspaceId()).toBe('ws-1');
    expect(getActiveWorkspaceSlug()).toBe('acme');

    act(() => {
      getWorkspaceContextState().setActiveWorkspace(null);
    });
    expect(getActiveWorkspaceId()).toBeNull();
    expect(getActiveWorkspaceSlug()).toBeNull();
  });

  it('re-renders hooks when the selection changes', () => {
    const { result } = renderHook(() => ({
      id: useActiveWorkspaceId(),
      slug: useActiveWorkspaceSlug(),
    }));
    expect(result.current).toEqual({ id: null, slug: null });

    act(() => {
      useWorkspaceContextStore
        .getState()
        .setActiveWorkspace({ id: 'ws-9', slug: 'team' });
    });
    expect(result.current).toEqual({ id: 'ws-9', slug: 'team' });
  });
});

describe('getBusinessTrpcHeaders', () => {
  it('emits no workspace header in personal mode', async () => {
    await expect(getBusinessTrpcHeaders()).resolves.toEqual({});
  });

  it('emits X-Workspace-Id when a workspace is active', async () => {
    act(() => {
      getWorkspaceContextState().setActiveWorkspace({ id: 'ws-1', slug: 'acme' });
    });
    await expect(getBusinessTrpcHeaders()).resolves.toEqual({
      'X-Workspace-Id': 'ws-1',
    });
  });
});
