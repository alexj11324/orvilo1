import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { FtsSearchResult } from '@/database/repositories/ftsSearch';

import SearchResults from './SearchResults';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('cmdk', () => ({
  Command: {
    Group: ({ children }: { children: ReactNode }) => <>{children}</>,
    Item: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
}));

vi.mock('@/components/Avatar', () => ({ default: () => null }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => navigate,
}));
vi.mock('./CommandMenuContext', () => ({
  useCommandMenuContext: () => ({ menuContext: 'general' }),
}));
vi.mock('@/store/image', () => ({
  useImageStore: (selector: (state: object) => unknown) =>
    selector({ activeGenerationTopicId: undefined, generationTopics: [] }),
}));
vi.mock('@/store/image/slices/generationTopic/selectors', () => ({
  generationTopicSelectors: {
    generationTopics: (state: { generationTopics: unknown[] }) => state.generationTopics,
  },
}));
vi.mock('@/store/video', () => ({
  useVideoStore: (selector: (state: object) => unknown) =>
    selector({ activeGenerationTopicId: undefined, generationTopics: [] }),
}));
vi.mock('@/store/video/slices/generationTopic/selectors', () => ({
  generationTopicSelectors: {
    generationTopics: (state: { generationTopics: unknown[] }) => state.generationTopics,
  },
}));
vi.mock('./components', () => ({
  CommandItem: ({ onSelect, title }: { onSelect: () => void; title: ReactNode }) => (
    <button type="button" onClick={onSelect}>
      {title}
    </button>
  ),
}));

describe('SearchResults', () => {
  it('keeps retained resource documents searchable without using the retired Page route', () => {
    const result = {
      createdAt: new Date('2026-09-16T00:00:00Z'),
      description: null,
      id: 'docs_resource-note',
      relevance: 1,
      title: 'Resource note',
      type: 'page',
      updatedAt: new Date('2026-09-16T00:00:00Z'),
    } as FtsSearchResult;

    render(
      <SearchResults
        isLoading={false}
        results={[result]}
        searchQuery="resource"
        typeFilter={undefined}
        onClose={vi.fn()}
        onResultClick={vi.fn()}
        onSetTypeFilter={vi.fn()}
        onTypeFilterChange={vi.fn()}
        onVisibleResultCountChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Resource note/ }));

    expect(navigate).toHaveBeenCalledWith('/resource?file=docs_resource-note');
  });
});
