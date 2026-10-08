import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Body from './index';

interface MockGlobalState {
  status: {
    hiddenSidebarSections?: string[];
    sidebarExpandedKeys?: string[];
    sidebarItems?: string[];
    workspace?: { hiddenSidebarSections?: string[]; sidebarExpandedKeys?: string[] };
  };
  updateSystemStatus: (patch: Partial<MockGlobalState['status']>) => void;
}

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: null as string | null,
  globalState: undefined as unknown as MockGlobalState,
  navLayout: {
    bottomMenuItems: [] as { key: string; title: string; url: string }[],
    topNavItems: [
      { key: 'tasks', title: 'Issues', url: '/tasks' },
      { key: 'inbox', title: 'Inbox', url: '/inbox' },
      { key: 'my-work', title: 'My issues', url: '/my-issues' },
      { key: 'reviews', title: 'Reviews', url: '/reviews' },
      { key: 'agent', title: 'Agent', url: '/agents' },
      { key: 'drafts', title: 'Drafts', url: '/drafts' },
    ],
  },
  searchParams: new URLSearchParams(),
  updateSystemStatus: vi.fn(),
}));

vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock('@/libs/router/navigation', () => ({
  useSearchParams: () => [mocks.searchParams],
  usePathname: () => '/',
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getActiveWorkspaceSlug: () => null,
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('@/features/NavPanel/components/SidebarNavItem', () => ({
  default: ({ title, render }: { title: string; render: ReactElement<{ to: string }> }) => (
    <li>{<a href={render.props.to}>{title}</a>}</li>
  ),
}));

vi.mock('@/hooks/useActiveTabKey', () => ({
  useActiveTabKey: () => 'home',
}));

vi.mock('@/hooks/useNavLayout', () => ({
  useNavLayout: () => mocks.navLayout,
}));

vi.mock('@/utils/navigation', () => ({
  isModifierClick: () => false,
}));

vi.mock('./Agent', () => ({
  default: ({ itemKey, open }: { itemKey: string; open: boolean }) => (
    <div data-open={open} data-testid={`sidebar-item-${itemKey}`} />
  ),
}));

vi.mock('./WorkFavorites', () => ({
  default: ({ itemKey, open }: { itemKey: string; open: boolean }) => (
    <div data-open={open} data-testid={`sidebar-item-${itemKey}`} />
  ),
}));

vi.mock('./WorkspaceSection', () => ({
  default: ({ itemKey, open }: { itemKey: string; open: boolean }) => (
    <div data-open={open} data-testid={`sidebar-item-${itemKey}`} />
  ),
}));

vi.mock('./TeamsSection', () => ({
  default: ({ itemKey, open }: { itemKey: string; open: boolean }) => (
    <div data-open={open} data-testid={`sidebar-item-${itemKey}`} />
  ),
}));

vi.mock('./CustomizeSidebarModal', () => ({
  openCustomizeSidebarModal: vi.fn(),
}));

vi.mock('./CreateRow', () => ({
  default: () => <div data-testid="sidebar-item-create" />,
}));

vi.mock('@/libs/swr', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useClientDataSWR: () => ({ data: undefined, error: undefined, isLoading: false }),
}));

vi.mock('./useSyncWorkspaceSidebarPreference', () => ({
  useSyncWorkspaceSidebarPreference: vi.fn(),
}));

vi.mock('../Header/components/useInboxUnreadCount', () => ({
  useInboxUnreadCount: () => ({ enabled: false, unreadCount: 0 }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: MockGlobalState) => unknown) => selector(mocks.globalState),
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ useFetchWorkspaceUserPreference: () => undefined }),
}));

beforeEach(() => {
  mocks.updateSystemStatus.mockReset();
  mocks.activeWorkspaceId = null;
  mocks.searchParams = new URLSearchParams();
  mocks.globalState = {
    status: {
      hiddenSidebarSections: [],
      sidebarExpandedKeys: ['agent', 'workspace', 'favorites', 'teams'],
      sidebarItems: ['home', 'create', 'reviews', 'recents', 'image'],
    },
    updateSystemStatus: mocks.updateSystemStatus,
  };
});

afterEach(() => {
  cleanup();
});

describe('Home sidebar body', () => {
  it('renders the fixed IA regardless of a stale stored order', () => {
    render(<Body />);

    const children = Array.from(
      screen.getByTestId('sidebar-body').querySelector('[data-sidebar=menu]')!.children,
    );
    const texts = children.map((child) => child.textContent);

    expect(texts).toEqual(['Issues', 'Inbox', 'My issues', 'Agent', 'Drafts']);
    expect(screen.queryByTestId('sidebar-item-create')).not.toBeInTheDocument();
    expect(screen.queryByText('Reviews')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByTestId('sidebar-item-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-favorites')).toBeInTheDocument();
    // There is no personal mode — Your teams renders even while the
    // workspace is still being provisioned (empty-state row inside).
    expect(screen.getByTestId('sidebar-item-teams')).toBeInTheDocument();
    expect(
      screen.getByTestId('sidebar-body').querySelector('[data-sidebar-bottom-spacer]'),
    ).toBeInTheDocument();
  });

  it('always renders the Your teams section', () => {
    mocks.activeWorkspaceId = 'ws-1';
    mocks.globalState.status.workspace = { hiddenSidebarSections: [] } as never;

    render(<Body />);

    expect(screen.getByTestId('sidebar-item-teams')).toBeInTheDocument();
  });

  it('hides an optional section via hiddenSidebarSections but never a core link', () => {
    mocks.globalState.status.hiddenSidebarSections = ['workspace', 'favorites', 'inbox'];

    render(<Body />);

    expect(screen.queryByTestId('sidebar-item-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-item-favorites')).not.toBeInTheDocument();
    // `inbox` is core — hidden sections cannot remove it.
    const texts = Array.from(
      screen.getByTestId('sidebar-body').querySelector('[data-sidebar=menu]')!.children,
    ).map((child) => child.textContent);
    expect(texts).toContain('Inbox');
  });

  it('passes persisted expansion to sections', () => {
    mocks.globalState.status.sidebarExpandedKeys = ['workspace'];

    render(<Body />);

    expect(screen.getByTestId('sidebar-item-workspace')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('sidebar-item-favorites')).toHaveAttribute('data-open', 'false');
  });
});
