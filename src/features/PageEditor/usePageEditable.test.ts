import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePageEditable } from './usePageEditable';

const mockState: {
  editor: Record<string, unknown>;
  page: { id: string; visibility: string; workspaceId: string | null } | undefined;
} = { editor: {}, page: undefined };

vi.mock('./store', () => ({
  usePageEditorStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mockState.editor),
}));

vi.mock('./usePageDocumentMetadata', () => ({
  usePageDocumentMetadata: () => mockState.page,
}));

vi.mock('@/store/document', () => ({
  useDocumentStore: (selector: () => unknown) => selector(),
}));

vi.mock('@/store/document/slices/editor', () => ({
  editorSelectors: { saveBlockedByLock: () => () => false },
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true }),
}));

vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: () => ({ canEditResource: true }),
}));

vi.mock('./usePageLockedByOther', () => ({
  usePageLockedByOther: () => false,
}));

describe('usePageEditable for pages opened by ID', () => {
  beforeEach(() => {
    mockState.page = undefined;
    mockState.editor = {
      documentId: 'team-doc',
      isLockPending: false,
      isWorkspacePage: false,
      lockOwnerId: undefined,
    };
  });

  it('holds editing until metadata identifies the document scope', () => {
    expect(renderHook(() => usePageEditable()).result.current).toBe(false);
  });

  it('holds a team document until the lock driver starts and resolves', () => {
    mockState.page = { id: 'team-doc', visibility: 'team', workspaceId: 'workspace' };

    expect(renderHook(() => usePageEditable()).result.current).toBe(false);

    mockState.editor.isWorkspacePage = true;
    expect(renderHook(() => usePageEditable()).result.current).toBe(false);

    mockState.editor.lockOwnerId = 'page:team-doc:session';
    mockState.editor.isLockPending = true;
    expect(renderHook(() => usePageEditable()).result.current).toBe(false);

    mockState.editor.isLockPending = false;
    expect(renderHook(() => usePageEditable()).result.current).toBe(true);
  });

  it('allows a loaded private page without a collaborative lock', () => {
    mockState.page = { id: 'team-doc', visibility: 'private', workspaceId: 'workspace' };
    expect(renderHook(() => usePageEditable()).result.current).toBe(true);
  });
});
