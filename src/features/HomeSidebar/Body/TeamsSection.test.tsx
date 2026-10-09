import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';

import TeamsSection from './TeamsSection';

const swr = vi.hoisted(() => ({
  state: {
    data: {
      data: [{ id: 'team-1', joined: true, key: 'ORV', name: 'orvilo' }],
    },
    error: undefined as unknown,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  },
}));

vi.mock('swr', () => ({
  default: () => swr.state,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'teams.subNav.home' ? 'Home' : key),
  }),
}));

vi.mock('@/features/NavPanel/components/SidebarContextMenu', () => ({
  default: ({
    children,
  }: {
    children:
      | React.ReactElement
      | ((trigger: (inner: React.ReactElement) => React.ReactElement) => React.ReactElement);
  }) => (typeof children === 'function' ? children((inner) => inner) : children),
}));

vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => null,
}));

vi.mock('@/features/NavPanel/components/SidebarNavItem', () => ({
  default: ({ title }: { title: string }) => <li>{title}</li>,
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
  beforeEach(() => {
    swr.state.data = { data: [{ id: 'team-1', joined: true, key: 'ORV', name: 'orvilo' }] };
    swr.state.error = undefined;
    swr.state.isLoading = false;
    swr.state.isValidating = false;
    swr.state.mutate.mockClear();
  });

  const renderSection = () =>
    render(
      <MemoryRouter>
        <SidebarProvider>
          <TeamsSection itemKey="teams" />
        </SidebarProvider>
      </MemoryRouter>,
    );

  it('offers sign-in instead of retry for an expired session', () => {
    swr.state.data = { data: [] };
    swr.state.error = { status: 401 };
    renderSection();
    expect(screen.getByRole('button', { name: 'asyncState.signIn' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'error.retry' })).not.toBeInTheDocument();
  });

  it('disables retry while the failed request is revalidating', () => {
    swr.state.data = { data: [] };
    swr.state.error = new Error('network');
    swr.state.isValidating = true;
    renderSection();
    expect(screen.getByRole('button', { name: /error.retry/ })).toBeDisabled();
  });

  it('retries a transient failure and keeps the directory reachable', () => {
    swr.state.data = { data: [] };
    swr.state.error = new Error('network');
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'error.retry' }));
    expect(swr.state.mutate).toHaveBeenCalledOnce();
    expect(screen.getByText('tab.teams')).toBeInTheDocument();
  });

  it('toggles the team by its name and leaves Home as navigation', () => {
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <SidebarProvider>
          <TeamsSection itemKey="teams" />
        </SidebarProvider>
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
        <SidebarProvider>
          <TeamsSection itemKey="teams" />
        </SidebarProvider>
      </MemoryRouter>,
    );

    // Linear exposes a ⋯ menu beside every team row — ours offers pin to
    // favorites and copy link, both backed by real surfaces.
    expect(screen.getByRole('button', { name: 'teams.menu' })).toBeInTheDocument();
  });
});
