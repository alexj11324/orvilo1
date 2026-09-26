import { AccordionRoot } from '@lobehub/ui/base-ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WorkFavorites from './WorkFavorites';

interface SwrState {
  data?: { data: { targetId: string; targetType: string }[] };
  error?: unknown;
  isLoading?: boolean;
  isValidating?: boolean;
}

const mocks = vi.hoisted(() => ({
  favorites: [] as { targetId: string; targetType: string }[],
  mutate: vi.fn(),
  reorder: vi.fn(),
  swr: undefined as SwrState | undefined,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: (event: { active: { id: string }; over: { id: string } }) => void;
  }) => (
    <div>
      <button
        data-testid="drop-first-on-last"
        onClick={() =>
          onDragEnd({ active: { id: 'task:favorite-0' }, over: { id: 'task:favorite-6' } })
        }
      />
      {children}
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'navPanel.show': 'Show',
          'tab.favorites': 'Favorites',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'ws-1',
}));

vi.mock('@/libs/swr', () => ({
  mutate: mocks.mutate,
  useClientDataSWR: () =>
    mocks.swr ?? {
      data: { data: mocks.favorites },
      error: undefined,
      isLoading: false,
      isValidating: false,
    },
}));

vi.mock('@/services/workAttention', () => ({
  workAttentionService: {
    favoriteList: vi.fn(),
    favoriteReorder: mocks.reorder,
    favoriteUnpin: vi.fn(),
  },
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: unknown) => unknown) =>
    selector({ status: {}, updateSystemStatus: vi.fn() }),
}));

vi.mock('./AllFavoritesDrawer', () => ({
  default: () => null,
}));

vi.mock('./FavoriteRow', () => ({
  default: ({ item }: { item: { targetId: string } }) => (
    <div data-testid={`favorite-${item.targetId}`} />
  ),
}));

const renderSection = () =>
  render(
    <AccordionRoot value={['favorites']}>
      <WorkFavorites itemKey="favorites" />
    </AccordionRoot>,
  );

afterEach(() => {
  cleanup();
  mocks.favorites = [];
  mocks.swr = undefined;
  mocks.mutate.mockClear();
  mocks.reorder.mockReset();
});

describe('WorkFavorites', () => {
  it('keeps the section header mounted when the workspace has no favorites', () => {
    renderSection();

    // Linear renders the Favorites group header even while empty — hiding the
    // whole section is a user preference, not a data condition.
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('renders a row per favorite when items exist', () => {
    mocks.favorites = [
      { targetId: 'view-1', targetType: 'savedView' },
      { targetId: 'project-1', targetType: 'project' },
    ];

    renderSection();

    expect(screen.getByTestId('favorite-view-1')).toBeInTheDocument();
    expect(screen.getByTestId('favorite-project-1')).toBeInTheDocument();
  });

  it('caps inline rows at the page size and offers a More row when overflowing', () => {
    mocks.favorites = Array.from({ length: 7 }, (_, index) => ({
      targetId: `favorite-${index}`,
      targetType: 'task',
    }));

    renderSection();

    expect(screen.getAllByTestId(/^favorite-favorite-/)).toHaveLength(5);
    expect(screen.getByText('more')).toBeInTheDocument();
  });

  it('persists a sidebar drop using the full ordered favorite list', async () => {
    mocks.favorites = Array.from({ length: 7 }, (_, index) => ({
      rank: index,
      targetId: `favorite-${index}`,
      targetType: 'task',
      version: index + 1,
    }));
    mocks.reorder.mockResolvedValue({ success: true });

    renderSection();
    fireEvent.click(screen.getByTestId('drop-first-on-last'));

    await waitFor(() => expect(mocks.reorder).toHaveBeenCalledOnce());
    // Overflow rows stay in the payload: dropping a visible row must not
    // silently drop the favorites hidden behind the More row.
    expect(
      mocks.reorder.mock.calls[0][0].items.map((item: { targetId: string }) => item.targetId),
    ).toEqual([
      'favorite-1',
      'favorite-2',
      'favorite-3',
      'favorite-4',
      'favorite-5',
      'favorite-6',
      'favorite-0',
    ]);
  });

  it('shows a skeleton while the first load is in flight', () => {
    mocks.swr = { data: undefined, error: undefined, isLoading: true };

    renderSection();

    expect(screen.getByTestId('work-favorites-loading')).toBeInTheDocument();
    expect(screen.queryByText('favorites.empty')).not.toBeInTheDocument();
  });

  it('shows a compact retry entry when the first load fails', () => {
    mocks.swr = { data: undefined, error: new Error('boom'), isLoading: false };

    renderSection();

    // A failed first load must not collapse into the empty state.
    expect(screen.getByRole('button', { name: 'error.retry' })).toBeInTheDocument();
    expect(screen.queryByText('favorites.empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('work-favorites-loading')).not.toBeInTheDocument();
  });

  it('retries the favorites request from the error entry', () => {
    mocks.swr = { data: undefined, error: new Error('boom'), isLoading: false };

    renderSection();

    screen.getByRole('button', { name: 'error.retry' }).click();
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('marks a settled empty list distinctly from loading and failure', () => {
    mocks.favorites = [];

    renderSection();

    expect(screen.getByText('favorites.empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'error.retry' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('work-favorites-loading')).not.toBeInTheDocument();
  });

  it('keeps rendered favorites and adds a non-blocking hint when revalidation fails', () => {
    mocks.favorites = [{ targetId: 'view-1', targetType: 'savedView' }];
    mocks.swr = {
      data: { data: mocks.favorites },
      error: new Error('boom'),
      isLoading: false,
      isValidating: false,
    };

    renderSection();

    expect(screen.getByTestId('favorite-view-1')).toBeInTheDocument();
    expect(screen.getByText('favorites.refreshFailed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'error.retry' })).toBeInTheDocument();
    expect(screen.queryByText('favorites.empty')).not.toBeInTheDocument();
  });
});
