import { AccordionRoot } from '@lobehub/ui/base-ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WorkFavorites from './WorkFavorites';

const mocks = vi.hoisted(() => ({
  favorites: [] as { targetId: string; targetType: string }[],
  reorder: vi.fn(),
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
  mutate: vi.fn(),
  useClientDataSWR: () => ({ data: { data: mocks.favorites } }),
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

vi.mock('./FavoriteRow', () => ({
  default: ({ item }: { item: { targetId: string } }) => (
    <div data-testid={`favorite-${item.targetId}`} />
  ),
}));

afterEach(() => {
  cleanup();
  mocks.favorites = [];
  mocks.reorder.mockReset();
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

  it('renders every favorite inline without an overflow drawer or More row', () => {
    mocks.favorites = Array.from({ length: 7 }, (_, index) => ({
      targetId: `favorite-${index}`,
      targetType: 'task',
    }));

    render(
      <AccordionRoot value={['favorites']}>
        <WorkFavorites itemKey="favorites" />
      </AccordionRoot>,
    );

    expect(screen.getAllByTestId(/^favorite-favorite-/)).toHaveLength(7);
    expect(screen.queryByText('more')).not.toBeInTheDocument();
    expect(screen.queryByText('navPanel.manageFavorites')).not.toBeInTheDocument();
  });

  it('persists a sidebar drop using the full ordered favorite list', async () => {
    mocks.favorites = Array.from({ length: 7 }, (_, index) => ({
      rank: index,
      targetId: `favorite-${index}`,
      targetType: 'task',
      version: index + 1,
    }));
    mocks.reorder.mockResolvedValue({ success: true });

    render(
      <AccordionRoot value={['favorites']}>
        <WorkFavorites itemKey="favorites" />
      </AccordionRoot>,
    );
    fireEvent.click(screen.getByTestId('drop-first-on-last'));

    await waitFor(() => expect(mocks.reorder).toHaveBeenCalledOnce());
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
});
