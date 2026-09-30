import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import NavHeader from '@/features/NavHeader';
import SearchSection from '@/features/SettingsSearch/SearchSection';

import { AppSidebar } from './AppSidebar';
import { NavWorkspace } from './NavWorkspace';

const platform = vi.hoisted(() => ({ desktop: false }));
const globalState = vi.hoisted(() => ({
  leftPanelDrawerMode: false,
  leftPanelDrawerOpen: false,
  status: { showLeftPanel: true },
  toggleLeftPanel: vi.fn(),
}));
const viewport = vi.hoisted(() => ({ mobile: false }));
const workspace = vi.hoisted(() => ({
  items: [{ id: 'w1', name: 'Team', slug: 'team' }],
  switchWorkspace: vi.fn(),
}));
vi.mock('@/const/version', () => ({
  get isDesktop() {
    return platform.desktop;
  },
}));
vi.mock('@/utils/platform', () => ({ isMacOS: () => false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: typeof globalState) => unknown) => selector(globalState),
}));
vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: {
    showLeftPanel: (state: typeof globalState) => state.status.showLeftPanel,
  },
}));
vi.mock('@/features/SettingsSearch/useSettingsSearch', () => ({
  useSettingsSearch: () => ({ isIndexing: false, results: [] }),
}));
vi.mock('@/features/SettingsSearch/SearchResults', () => ({
  default: () => <div>Search results</div>,
}));
vi.mock('./NavMain', () => ({ NavMain: () => null }));
vi.mock('./NotificationsPopover', () => ({ NotificationsPopover: () => null }));
vi.mock('./Logo', () => ({ Logo: () => null }));
vi.mock('@/business/client/hooks/useWorkspaces', () => ({ useWorkspaces: () => workspace.items }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'w1',
}));
vi.mock('@/business/client/hooks/useSwitchWorkspace', () => ({
  useSwitchWorkspace: () => ({ switchWorkspace: workspace.switchWorkspace }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/features/User/UserPanel/useMenu', () => ({ useMenu: () => ({ mainItems: [] }) }));
vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  renderSidebarMenuItems: () => null,
}));
vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => vi.fn() }));
vi.mock('@/hooks/useUserAvatar', () => ({ useUserAvatar: () => '' }));
vi.mock('@/store/user', () => ({ useUserStore: () => ['User', true, vi.fn()] }));
vi.mock('@/store/user/selectors', () => ({ authSelectors: {}, userProfileSelectors: {} }));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme: vi.fn() }) }));
vi.mock('@/components/ui/dropdown-menu', () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    DropdownMenu: Container,
    DropdownMenuContent: Container,
    DropdownMenuGroup: Container,
    DropdownMenuLabel: Container,
    DropdownMenuTrigger: Container,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({ children, onClick }: PropsWithChildren<{ onClick?: () => void }>) =>
      onClick ? (
        <button role="menuitem" onClick={onClick}>
          {children}
        </button>
      ) : (
        <div>{children}</div>
      ),
  };
});
beforeEach(() => {
  platform.desktop = false;
  viewport.mobile = false;
  globalState.status.showLeftPanel = true;
  globalState.leftPanelDrawerMode = false;
  globalState.leftPanelDrawerOpen = false;
  workspace.items = [{ id: 'w1', name: 'Team', slug: 'team' }];
  vi.clearAllMocks();
});

function DrawerControl() {
  const { openMobile, state, toggleSidebar } = useSidebar();
  return (
    <button onClick={toggleSidebar}>
      {state} / {openMobile ? 'open' : 'closed'}
    </button>
  );
}
function ControlledDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(!open)}>External toggle</button>
      <SidebarProvider openMobile={open} onOpenMobileChange={setOpen}>
        <DrawerControl />
        <Sidebar>
          <div>Drawer content</div>
        </Sidebar>
      </SidebarProvider>
    </>
  );
}
function SearchShell() {
  const [open, setOpen] = useState(false);
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <SearchSection>Categories</SearchSection>
    </SidebarProvider>
  );
}

describe('sidebar toggle ownership', () => {
  it('removes the redundant collapsed web sidebar trigger', () => {
    render(
      <SidebarProvider open={false}>
        <AppSidebar />
      </SidebarProvider>,
    );
    expect(screen.queryByRole('button', { name: 'reuiShell9.expandSidebar' })).toBeNull();
  });
  it('keeps the expanded web sidebar collapse entry', () => {
    render(
      <SidebarProvider open>
        <AppSidebar />
      </SidebarProvider>,
    );
    expect(screen.getAllByRole('button', { name: 'reuiShell9.collapseSidebar' })).toHaveLength(1);
  });
  it('keeps one Linux expanded collapse entry in the real shell and page header', () => {
    platform.desktop = true;
    render(
      <SidebarProvider open>
        <AppSidebar />
        <NavHeader>Settings</NavHeader>
      </SidebarProvider>,
    );
    const entries = [
      ...screen.queryAllByRole('button', { name: 'reuiShell9.collapseSidebar' }),
      ...screen.queryAllByRole('button', { name: 'toggleLeftPanel.title' }),
    ];
    expect(entries).toHaveLength(1);
  });
  it('keeps the Linux collapsed page entry', () => {
    platform.desktop = true;
    globalState.status.showLeftPanel = false;
    render(
      <SidebarProvider open={false}>
        <AppSidebar />
        <NavHeader>Settings</NavHeader>
      </SidebarProvider>,
    );
    expect(screen.getAllByRole('button', { name: 'toggleLeftPanel.title' })).toHaveLength(1);
  });
  it('exposes the narrow drawer entry despite an expanded desktop preference', () => {
    viewport.mobile = true;
    globalState.leftPanelDrawerMode = true;
    render(<NavHeader>Settings</NavHeader>);
    expect(screen.getByRole('button', { name: 'toggleLeftPanel.title' })).toBeTruthy();
  });
  it('keeps an entry for content-free headers when navigation is collapsed', () => {
    globalState.status.showLeftPanel = false;
    render(<NavHeader />);
    expect(screen.getByRole('button', { name: 'toggleLeftPanel.title' })).toBeTruthy();
  });
});

describe('drawer provider compatibility', () => {
  it('supports uncontrolled mobile toggles without changing desktop expansion', () => {
    viewport.mobile = true;
    render(
      <SidebarProvider defaultOpen>
        <DrawerControl />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'expanded / closed' }));
    fireEvent.click(screen.getByRole('button', { name: 'expanded / open' }));
    expect(screen.getByRole('button', { name: 'expanded / closed' })).toBeTruthy();
  });
  it('synchronizes external opening, Escape dismissal and reopening', async () => {
    viewport.mobile = true;
    const user = userEvent.setup();
    render(<ControlledDrawer />);
    await user.click(screen.getByRole('button', { name: 'External toggle' }));
    expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sidebar' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'External toggle' }));
    expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeTruthy();
  });
});

describe('collapsed settings search', () => {
  it('expands and focuses the search input using the keyboard', async () => {
    const user = userEvent.setup();
    render(<SearchShell />);
    const trigger = screen.getByRole('button', { name: 'settingsSearch.placeholder' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const input = screen.getByRole('searchbox');
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.keyboard('privacy');
    expect(input).toHaveValue('privacy');
    expect(screen.getByText('Search results')).toBeTruthy();
  });
  it('retains the query when collapsing and expanding', () => {
    const { rerender } = render(
      <SidebarProvider open>
        <SearchSection>Categories</SearchSection>
      </SidebarProvider>,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'privacy' } });
    rerender(
      <SidebarProvider open={false}>
        <SearchSection>Categories</SearchSection>
      </SidebarProvider>,
    );
    expect(screen.queryByText('Search results')).toBeNull();
    rerender(
      <SidebarProvider open>
        <SearchSection>Categories</SearchSection>
      </SidebarProvider>,
    );
    expect(screen.getByRole('searchbox')).toHaveValue('privacy');
  });
});

describe('workspace destinations', () => {
  it('offers actual workspaces and no Personal destination that root routing would overwrite', () => {
    render(
      <SidebarProvider>
        <NavWorkspace />
      </SidebarProvider>,
    );
    expect(screen.queryByRole('menuitem', { name: /workspaceSwitcher.personal/ })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /Team/ }));
    expect(workspace.switchWorkspace).toHaveBeenCalledWith('w1');
  });
  it('does not invent a Personal action for a user without memberships', () => {
    workspace.items = [];
    render(
      <SidebarProvider>
        <NavWorkspace />
      </SidebarProvider>,
    );
    expect(screen.queryByRole('menuitem', { name: /workspaceSwitcher.personal/ })).toBeNull();
    expect(screen.queryByText('reuiShell9.organizations')).toBeNull();
  });
});
