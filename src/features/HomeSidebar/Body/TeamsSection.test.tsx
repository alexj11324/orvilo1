import { AccordionRoot } from '@lobehub/ui/base-ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import TeamsSection from './TeamsSection';

vi.mock('swr', () => ({
  default: () => ({
    data: {
      data: [{ id: 'team-1', joined: true, key: 'ORV', name: 'orvilo' }],
    },
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'teams.subNav.home' ? 'Home' : key),
  }),
}));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ActionIcon: ({ title }: { title: string }) => <button type="button">{title}</button>,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => null,
}));

vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({ title }: { title: string }) => <span>{title}</span>,
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/useActiveTabKey', () => ({
  useActiveTabKey: () => 'teams',
}));

vi.mock('@/hooks/useAppOrigin', () => ({
  useAppOrigin: () => 'https://app.example.com',
}));

vi.mock('./useWorkFavoriteToggle', () => ({
  useWorkFavoriteToggle: () => ({ pinned: false, toggle: vi.fn() }),
}));

vi.mock('@/libs/router/navigation', () => ({
  usePathname: () => '/teams/team-1',
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: { team: { teams: { query: vi.fn() } } },
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: unknown) => unknown) =>
    selector({ updateSystemStatus: vi.fn() }),
}));

vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: { hiddenSidebarSections: () => () => [] },
}));

vi.mock('@/store/user', () => ({
  useUserStore: () => 'user-1',
}));

vi.mock('../hooks/useTeamSubNav', () => ({
  teamAccordionKey: (id: string) => `team:${id}`,
  useTeamSubNav: (keys: string[]) => {
    const [expandedTeamKeys, setExpandedTeamKeys] = useState(keys);
    return { expandedTeamKeys, setExpandedTeamKeys };
  },
}));

describe('TeamsSection', () => {
  it('toggles the team by its name and leaves Home as navigation', () => {
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <AccordionRoot value={['teams']}>
          <TeamsSection itemKey="teams" />
        </AccordionRoot>
        <Routes>
          <Route element={<output data-testid="location">/inbox</output>} path="/inbox" />
          <Route
            element={<output data-testid="location">/teams/team-1</output>}
            path="/teams/team-1"
          />
        </Routes>
      </MemoryRouter>,
    );

    const team = screen.getByRole('button', { name: 'orvilo' });
    expect(team).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/teams/team-1');

    fireEvent.click(team);
    expect(team).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('location')).toHaveTextContent('/inbox');

    fireEvent.click(team);
    expect(team).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/teams/team-1');
  });

  it('shows a team-menu action on each team row', () => {
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <AccordionRoot value={['teams']}>
          <TeamsSection itemKey="teams" />
        </AccordionRoot>
      </MemoryRouter>,
    );

    // Linear exposes a ⋯ menu beside every team row — ours offers pin to
    // favorites and copy link, both backed by real surfaces.
    expect(screen.getByRole('button', { name: 'teams.menu' })).toBeInTheDocument();
  });
});
