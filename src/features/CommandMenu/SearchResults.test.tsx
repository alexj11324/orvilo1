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

  it('routes memory results to the retained preferences manager, never a retired surface', () => {
    const result = {
      createdAt: new Date('2026-09-16T00:00:00Z'),
      description: null,
      id: 'pref_1',
      relevance: 1,
      title: 'Likes concise answers',
      type: 'memory',
      updatedAt: new Date('2026-09-16T00:00:00Z'),
    } as FtsSearchResult;

    render(
      <SearchResults
        isLoading={false}
        results={[result]}
        searchQuery="concise"
        typeFilter={undefined}
        onClose={vi.fn()}
        onResultClick={vi.fn()}
        onSetTypeFilter={vi.fn()}
        onTypeFilterChange={vi.fn()}
        onVisibleResultCountChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Likes concise answers/ }));

    expect(navigate).toHaveBeenCalledWith('/memory/preferences?preferenceId=pref_1');
    for (const [url] of navigate.mock.calls) {
      expect(['/image', '/video', '/memory', '/memory-center', '/eval']).not.toContain(
        new URL(url, 'http://localhost').pathname,
      );
    }
  });

  it('routes work sidecar hits to task, team, project and view pages', () => {
    const stamp = new Date('2026-09-18T00:00:00Z');
    const results = [
      {
        createdAt: stamp,
        description: 'T-12',
        id: 'task_1',
        relevance: 1,
        title: 'Ship the inbox',
        type: 'task',
        updatedAt: stamp,
      },
      {
        createdAt: stamp,
        description: 'ENG',
        id: 'team_1',
        relevance: 2,
        title: 'Engineering',
        type: 'team',
        updatedAt: stamp,
      },
      {
        createdAt: stamp,
        description: null,
        id: 'builtin:all',
        relevance: 3,
        title: 'All tasks',
        type: 'savedView',
        updatedAt: stamp,
      },
    ] as const;

    render(
      <SearchResults
        isLoading={false}
        results={[...results]}
        searchQuery="ship"
        typeFilter={undefined}
        onClose={vi.fn()}
        onResultClick={vi.fn()}
        onSetTypeFilter={vi.fn()}
        onTypeFilterChange={vi.fn()}
        onVisibleResultCountChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ship the inbox/ }));
    fireEvent.click(screen.getByRole('button', { name: /Engineering/ }));
    fireEvent.click(screen.getByRole('button', { name: /savedViews.builtinName.all/ }));

    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/task/task_1'));
    expect(navigate).toHaveBeenCalledWith('/teams/team_1');
    expect(navigate).toHaveBeenCalledWith('/views/builtin:all');
  });
});
