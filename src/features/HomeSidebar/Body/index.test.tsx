import { cleanup, render, screen } from '@testing-library/react';
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
      { key: 'inbox', title: 'Inbox', url: '/inbox' },
      { key: 'my-work', title: 'My issues', url: '/my-issues' },
      { key: 'reviews', title: 'Reviews', url: '/reviews' },
      { key: 'agent', title: 'Agent', url: '/agents' },
    ],
  },
  searchParams: new URLSearchParams(),
  updateSystemStatus: vi.fn(),
}));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Flexbox: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-body">{children}</div>
  ),
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  AccordionRoot: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (keys: string[]) => void;
    value?: string[];
  }) => (
    <div data-expanded-keys={JSON.stringify(value)} data-testid="sidebar-accordion">
      {children}
    </div>
  ),
}));

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
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

vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
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
  default: ({ itemKey }: { itemKey: string }) => <div data-testid={`sidebar-item-${itemKey}`} />,
}));

vi.mock('./WorkFavorites', () => ({
  default: ({ itemKey }: { itemKey: string }) => <div data-testid={`sidebar-item-${itemKey}`} />,
}));

vi.mock('./WorkspaceSection', () => ({
  default: ({ itemKey }: { itemKey: string }) => <div data-testid={`sidebar-item-${itemKey}`} />,
}));

vi.mock('./TeamsSection', () => ({
  default: ({ itemKey }: { itemKey: string }) => <div data-testid={`sidebar-item-${itemKey}`} />,
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
      sidebarItems: ['recents', 'tasks', 'image'],
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

    const children = Array.from(screen.getByTestId('sidebar-body').children);
    const texts = children.map((child) => child.textContent);

    // Core links first, in contract order — the stored legacy keys
    // (recents/tasks/image) can neither reorder nor resurrect. Agent is a
    // flat row now; the old agent accordion is retired.
    expect(texts[0]).toBe('Inbox');
    expect(texts[1]).toBe('My issues');
    expect(texts[2]).toBe('Reviews');
    expect(texts[3]).toBe('Agent');
    // The standalone quick-create row sits between the flat links and the
    // first accordion, mirroring Linear's `+` slot.
    expect(children[4]).toHaveAttribute('data-testid', 'sidebar-item-create');
    expect(screen.getByTestId('sidebar-item-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-item-favorites')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-item-teams')).not.toBeInTheDocument();
    expect(children.some((child) => child.hasAttribute('data-sidebar-bottom-spacer'))).toBe(true);
  });

  it('shows the Your teams group only in workspace mode', () => {
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
    const texts = Array.from(screen.getByTestId('sidebar-body').children).map(
      (child) => child.textContent,
    );
    expect(texts).toContain('Inbox');
  });

  it('passes persisted expanded keys to the accordion', () => {
    mocks.globalState.status.sidebarExpandedKeys = ['workspace'];

    render(<Body />);

    expect(screen.getByTestId('sidebar-accordion')).toHaveAttribute(
      'data-expanded-keys',
      '["workspace"]',
    );
  });
});
