import { AccordionRoot } from '@lobehub/ui/base-ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WorkFavorites from './WorkFavorites';

const mocks = vi.hoisted(() => ({
  favorites: [] as { targetId: string; targetType: string }[],
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
  mutate: vi.fn(),
  useClientDataSWR: () => ({ data: { data: mocks.favorites } }),
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

afterEach(() => {
  cleanup();
  mocks.favorites = [];
});

describe('WorkFavorites', () => {
  it('keeps the section header mounted when the workspace has no favorites', () => {
    render(
      <AccordionRoot value={['favorites']}>
        <WorkFavorites itemKey="favorites" />
      </AccordionRoot>,
    );

    // Linear renders the Favorites group header even while empty — hiding the
    // whole section is a user preference, not a data condition.
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('renders a row per favorite when items exist', () => {
    mocks.favorites = [
      { targetId: 'view-1', targetType: 'savedView' },
      { targetId: 'project-1', targetType: 'project' },
    ];

    render(
      <AccordionRoot value={['favorites']}>
        <WorkFavorites itemKey="favorites" />
      </AccordionRoot>,
    );

    expect(screen.getByTestId('favorite-view-1')).toBeInTheDocument();
    expect(screen.getByTestId('favorite-project-1')).toBeInTheDocument();
  });
});
