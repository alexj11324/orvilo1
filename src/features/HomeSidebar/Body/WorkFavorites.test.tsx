import { AccordionRoot } from '@lobehub/ui/base-ui';
import { cleanup, render, screen } from '@testing-library/react';
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
  swr: undefined as SwrState | undefined,
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
