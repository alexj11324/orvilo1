import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NavigationBar from './NavigationBar';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  navigate: vi.fn(),
  openAllAgentsDrawer: vi.fn(),
  showLeftPanel: true,
}));

vi.mock('@orvilo/electron-client-ipc', () => ({
  useWatchBroadcast: (event: string, handler: () => void) => mocks.handlers.set(event, handler),
}));

vi.mock('@/features/NavPanel/ToggleLeftPanelButton', () => ({ default: () => null }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/services/electron/system', () => ({ electronSystemService: {} }));
vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: unknown) => unknown) =>
    selector({ status: { showLeftPanel: mocks.showLeftPanel } }),
}));
vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: {
    showLeftPanel: (state: { status: { showLeftPanel: boolean } }) => state.status.showLeftPanel,
  },
}));
vi.mock('@/store/home', () => ({
  getHomeStoreState: () => ({ openAllAgentsDrawer: mocks.openAllAgentsDrawer }),
}));
vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (state: unknown) => unknown) =>
    selector({ activeRecentScope: { slug: 'acme', type: 'workspace' } }),
}));
vi.mock('@/styles/electron', () => ({ electronStylish: { nodrag: 'nodrag' } }));
vi.mock('@/utils/platform', () => ({ isMacOS: () => false }));
vi.mock('../navigation/useNavigationHistory', () => ({
  useNavigationHistory: () => ({
    canGoBack: false,
    canGoForward: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
  }),
}));
vi.mock('./RecentlyViewed', () => ({ default: () => <div>recently-viewed</div> }));
vi.mock('./TrayMenu/useTrayMenuSync', () => ({ useTrayMenuSync: vi.fn() }));

describe('NavigationBar tray broadcasts', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.showLeftPanel = true;
    vi.clearAllMocks();
  });

  it.each([
    [true, '250'],
    [false, '0'],
  ])('aligns the titlebar with the App Shell 9 frame when open=%s', (open, width) => {
    mocks.showLeftPanel = open;
    const { container } = render(<NavigationBar />);

    expect(container.querySelector('[data-width]')).toHaveAttribute('data-width', width);
    expect(container.querySelector('[data-width]')).toHaveStyle({
      width: open ? '238px' : '150px',
    });
  });

  it('opens the existing Recently Viewed popover', () => {
    render(<NavigationBar />);

    act(() => mocks.handlers.get('openRecentlyViewed')?.());

    expect(screen.getByText('recently-viewed')).toBeInTheDocument();
  });

  it('toggles Recently Viewed with Ctrl+Y', () => {
    render(<NavigationBar />);

    fireEvent.keyDown(window, { ctrlKey: true, key: 'y' });
    expect(screen.getByText('recently-viewed')).toBeInTheDocument();

    fireEvent.keyDown(window, { ctrlKey: true, key: 'y' });
    expect(screen.queryByText('recently-viewed')).not.toBeInTheDocument();
  });

  it('opens the workspace agent browser without creating a topic', () => {
    render(<NavigationBar />);

    act(() => mocks.handlers.get('openAllAgents')?.());

    expect(mocks.navigate).toHaveBeenCalledWith('/acme', { escape: true });
    expect(mocks.openAllAgentsDrawer).toHaveBeenCalled();
  });
});
