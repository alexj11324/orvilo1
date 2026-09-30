import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePageDocumentMetadata, usePageDocumentMetadataActions } from './usePageDocumentMetadata';

const mockState: {
  list: { id: string; title: string; visibility: string } | undefined;
  open: { id: string; title: string; visibility: string } | null | undefined;
} = { list: undefined, open: undefined };
const mockDocuments: { id: string }[] = [];
const mockMutate = vi.fn();
const updatePageOptimistically = vi.fn();

vi.mock('@/store/page', () => ({
  pageSelectors: {
    getDocumentById: (id: string | undefined) => () =>
      mockState.list?.id === id ? mockState.list : undefined,
  },
  usePageStore: Object.assign(
    (selector: (state: { updatePageOptimistically: typeof updatePageOptimistically }) => unknown) =>
      selector({ updatePageOptimistically }),
    { getState: () => ({ documents: mockDocuments }) },
  ),
}));

vi.mock('@/libs/swr', () => ({
  mutate: (...args: unknown[]) => mockMutate(...args),
  useClientDataSWR: () => ({ data: mockState.open }),
}));

describe('usePageDocumentMetadata', () => {
  beforeEach(() => {
    mockDocuments.length = 0;
    mockMutate.mockClear();
    updatePageOptimistically.mockClear();
  });

  it('keeps an open team page metadata after the Pages list refreshes', () => {
    mockState.list = { id: 'team-page', title: 'Team plan', visibility: 'team' };
    mockState.open = { id: 'team-page', title: 'Team plan', visibility: 'team' };
    const { rerender, result } = renderHook(() => usePageDocumentMetadata('team-page'));
    expect(result.current?.title).toBe('Team plan');

    mockState.list = undefined;
    rerender();
    expect(result.current?.title).toBe('Team plan');
    expect(result.current?.visibility).toBe('team');
  });

  it('treats a missing direct document as unavailable even if list metadata is stale', () => {
    mockState.list = { id: 'team-page', title: 'Stale', visibility: 'team' };
    mockState.open = null;
    expect(renderHook(() => usePageDocumentMetadata('team-page')).result.current).toBeUndefined();
  });

  it('keeps optimistic title edits from the page store ahead of stale editor cache', () => {
    mockState.list = { id: 'team-page', title: 'Renamed plan', visibility: 'team' };
    mockState.open = { id: 'team-page', title: 'Team plan', visibility: 'team' };
    expect(renderHook(() => usePageDocumentMetadata('team-page')).result.current?.title).toBe(
      'Renamed plan',
    );
  });

  it('updates editor metadata when an open team Page is absent from the global Pages list', () => {
    const { result } = renderHook(() => usePageDocumentMetadataActions('team-page'));

    act(() => {
      result.current.updateTitle('Renamed plan');
      result.current.updateEmoji('📄');
    });

    expect(updatePageOptimistically).not.toHaveBeenCalled();
    expect(mockMutate).toHaveBeenCalledTimes(2);
    expect(mockMutate.mock.calls[0][0]).toEqual(['document:editor', 'team-page']);
    expect(mockMutate.mock.calls[0][1]({ id: 'team-page', title: 'Team plan' })).toMatchObject({
      title: 'Renamed plan',
    });
    expect(mockMutate.mock.calls[1][1]({ id: 'team-page', metadata: {} })).toMatchObject({
      metadata: { emoji: '📄' },
    });
  });
});
