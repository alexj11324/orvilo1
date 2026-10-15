import type * as OrvilochatConst from '@orvilo/const';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const analyticsTrack = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) =>
      ({
        'changelog': 'Changelog',
        'getApp': 'Get App',
        'userPanel.discord': 'Discord',
        'userPanel.docs': 'Docs',
        'userPanel.feedback': 'Feedback',
        'userPanel.help': 'Help',
        'userPanel.inviteFriend': 'Invite a friend',
        'userPanel.setting': 'Settings',
      })[key] || key,
  }),
}));

interface RenderFooterOptions {
  billboardItems?: unknown[];
  desktop?: boolean;
  /** `undefined` models a deployment that runs no community server. */
  discordUrl?: string;
  /** `undefined` models a deployment that publishes no documentation site. */
  docsUrl?: string;
  hideGitHub?: boolean;
  homeSidebar?: boolean;
  showChangelog?: boolean;
}

let mockUserState: Record<string, unknown>;

const renderFooter = async ({
  billboardItems = [],
  desktop = false,
  discordUrl,
  docsUrl,
  homeSidebar = false,
  hideGitHub = true,
  showChangelog = false,
}: RenderFooterOptions = {}) => {
  vi.resetModules();
  analyticsTrack.mockReset();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  });

  mockUserState = {
    defaultSettings: {},
    settings: { general: { isDevMode: false } },
  };

  vi.doMock('@orvilo/const', async (importOriginal) => {
    const actual = (await importOriginal()) as typeof OrvilochatConst;

    return {
      ...actual,
      isDesktop: desktop,
    };
  });
  // Pin the community URL instead of reading the shipped branding, so the
  // Discord entry's presence is decided by this test rather than by whichever
  // URL the current deployment happens to configure.
  vi.doMock('@orvilo/business-const', async (importOriginal) => {
    const actual = (await importOriginal()) as {
      BRANDING_URL: Record<string, string | undefined>;
      SOCIAL_URL: Record<string, string | undefined>;
    };

    return {
      ...actual,
      BRANDING_URL: { ...actual.BRANDING_URL, help: docsUrl },
      SOCIAL_URL: { ...actual.SOCIAL_URL, discord: discordUrl },
    };
  });
  function createAnalyticsApi() {
    return {
      analytics: { track: analyticsTrack },
    };
  }
  vi.doMock('@/libs/analytics/client', () => ({
    useAnalytics: createAnalyticsApi,
  }));
  vi.doMock('@/components/ChangelogModal', () => ({
    default: vi.fn(),
    openChangelogModal: vi.fn(),
  }));
  vi.doMock('@/components/FeedbackModal', () => ({
    default: vi.fn(),
    openFeedbackModal: vi.fn(),
  }));
  vi.doMock('@/features/Billboard', () => ({
    default: () => null,
  }));
  vi.doMock('@/features/Billboard/MenuItems', () => ({
    useBillboardMenuItems: () => billboardItems,
  }));
  vi.doMock('@/features/NavPanel/useActiveNavKey', () => ({
    useActiveNavKey: () => (homeSidebar ? 'home' : 'discover'),
  }));
  vi.doMock('@/features/User/UserPanel/ThemeButton', () => ({
    default: () => null,
  }));
  vi.doMock('@/features/RightPanel/ToggleRightPanelButton', () => ({
    default: () => <span data-testid="toggle-right-panel" />,
  }));
  vi.doMock('@/features/User/UserPanel', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }));
  vi.doMock('@/features/User/UserAvatar', () => ({
    default: () => null,
  }));
  vi.doMock('@/features/Workspace/WorkspaceLink', () => ({
    default: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  }));
  function createNavLayoutState() {
    return {
      bottomMenuItems: [],
      footer: {
        hideGitHub,
        layout: 'compact',
        showChangelog,
        showEvalEntry: false,
        showSettingsEntry: true,
      },
      topNavItems: [],
      userPanel: {
        showDataImporter: false,
        showMemory: true,
      },
    };
  }
  vi.doMock('@/hooks/useNavLayout', () => ({
    useNavLayout: createNavLayoutState,
  }));
  function selectFromUserStore(selector: (state: Record<string, unknown>) => unknown) {
    return selector(mockUserState);
  }
  vi.doMock('@/store/user', () => ({
    useUserStore: selectFromUserStore,
  }));

  const { default: Footer } = await import('./index');

  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Footer />} path="/" />
        <Route element={<div>Onboarding route</div>} path="/onboarding" />
      </Routes>
    </MemoryRouter>,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.doUnmock('@orvilo/business-const');
  vi.doUnmock('@orvilo/const');
  vi.doUnmock('@/libs/analytics/client');
  vi.doUnmock('@/components/ChangelogModal');
  vi.doUnmock('@/components/FeedbackModal');
  vi.doUnmock('@/features/Billboard');
  vi.doUnmock('@/features/Billboard/MenuItems');
  vi.doUnmock('@/features/NavPanel');
  vi.doUnmock('@/features/RightPanel/ToggleRightPanelButton');
  vi.doUnmock('@/features/User/UserPanel/ThemeButton');
  vi.doUnmock('@/features/Workspace/WorkspaceLink');
  vi.doUnmock('@/hooks/useNavLayout');
  vi.doUnmock('@/store/user');
});

describe('Footer help menu tracking', () => {
  it('shows Get App immediately before GitHub on web', async () => {
    const user = userEvent.setup();
    await renderFooter({ hideGitHub: false });

    await user.click(screen.getByRole('button', { name: 'Help' }));

    const getApp = await screen.findByRole('link', { name: 'Get App' });
    const github = screen.getByRole('link', { name: 'GitHub' });

    expect(getApp).toHaveAttribute('href', '/settings/about');
    expect(getApp.compareDocumentPosition(github) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, 20000);

  it('shows Get App in desktop builds too', async () => {
    const user = userEvent.setup();
    await renderFooter({ desktop: true, hideGitHub: false });

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(await screen.findByRole('link', { name: 'Get App' })).toHaveAttribute(
      'href',
      '/settings/about',
    );
  }, 20000);

  it('tracks menu open with the visible item keys', async () => {
    const user = userEvent.setup();
    await renderFooter();

    await user.click(screen.getByRole('button', { name: 'Help' }));

    const openedCall = analyticsTrack.mock.calls.find(
      ([event]) => event?.name === 'home_footer_menu_opened',
    );
    expect(openedCall).toBeTruthy();
    // Get App remains an unconditional own item.
    expect((openedCall![0].properties.keys as string).split(',')).toContain('get-app');
  }, 20000);

  it('tracks a unified click event when a footer entry is clicked', async () => {
    const user = userEvent.setup();
    await renderFooter({ showChangelog: true });

    await user.click(screen.getByRole('button', { name: 'Help' }));
    await user.click(await screen.findByText('Changelog'));

    expect(analyticsTrack).toHaveBeenCalledWith({
      name: 'home_footer_menu_clicked',
      properties: { key: 'changelog', spm: 'homepage.footer.changelog.clicked' },
    });
  }, 20000);

  // Regression for the retirement. The entry used to be gated on business
  // features, so the old test could only assert its absence in the disabled
  // case — which held for a reason that had nothing to do with the entry being
  // gone. Both the row and the page it linked to were retired, so the
  // assertion is now unconditional.
  it('offers no invite friend entry', async () => {
    const user = userEvent.setup();
    await renderFooter();

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.queryByText('Invite a friend')).not.toBeInTheDocument();
  }, 20000);

  // Regression: the Discord row is an `<a href={undefined}>` when the
  // deployment runs no community server — a link that renders, looks live and
  // goes nowhere. It must be dropped, without taking the divider that follows
  // it (which separates the help links from the app entries) down with it.
  it('drops the community entry when no server is configured', async () => {
    const user = userEvent.setup();
    await renderFooter({
      discordUrl: undefined,
      docsUrl: 'https://docs.example.com',
      showChangelog: true,
    });

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(await screen.findByText('Docs')).toBeInTheDocument();
    expect(screen.queryByText('Discord')).not.toBeInTheDocument();
    expect(screen.queryByText('Feedback')).not.toBeInTheDocument();
    expect(screen.getByText('Changelog')).toBeInTheDocument();
  }, 20000);

  it('keeps the community entry, pointing at the configured server', async () => {
    const user = userEvent.setup();
    await renderFooter({ discordUrl: 'https://discord.gg/orvilo' });

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(await screen.findByRole('link', { name: 'Discord' })).toHaveAttribute(
      'href',
      'https://discord.gg/orvilo',
    );
  }, 20000);

  // Regression: the docs row linked to a hosted documentation site whether or
  // not the deployment had one, and the changelog row ignored its own flag.
  it('drops the docs and changelog entries when the deployment offers neither', async () => {
    const user = userEvent.setup();
    await renderFooter();

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(await screen.findByRole('link', { name: 'Get App' })).toBeInTheDocument();
    expect(screen.queryByText('Feedback')).not.toBeInTheDocument();
    expect(screen.queryByText('Docs')).not.toBeInTheDocument();
    expect(screen.queryByText('Changelog')).not.toBeInTheDocument();
  }, 20000);

  it('links the docs entry to the configured documentation site', async () => {
    const user = userEvent.setup();
    await renderFooter({ docsUrl: 'https://docs.example.com' });

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(await screen.findByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      'https://docs.example.com',
    );
  }, 20000);

  // Linear's bottom bar puts the agent-panel switch next to the avatar on the
  // right — that affordance belongs to the main (home) sidebar only.
  it('shows the agent-panel toggle on the home sidebar but not other panels', async () => {
    await renderFooter({ homeSidebar: true });
    expect(screen.getByTestId('toggle-right-panel')).toBeInTheDocument();

    cleanup();
    await renderFooter({ homeSidebar: false });
    expect(screen.queryByTestId('toggle-right-panel')).not.toBeInTheDocument();
  });

  it('excludes billboard items from the opened keys to keep per-key CTR aligned', async () => {
    const user = userEvent.setup();
    await renderFooter({
      billboardItems: [{ key: 'billboard-promo', label: 'Promo', onClick: vi.fn() }],
      homeSidebar: true,
    });

    await user.click(screen.getByRole('button', { name: 'Help' }));

    const openedCall = analyticsTrack.mock.calls.find(
      ([event]) => event?.name === 'home_footer_menu_opened',
    );
    const keys = (openedCall![0].properties.keys as string).split(',');
    // own items are tracked and reported as exposure...
    expect(keys).toContain('get-app');
    // ...but billboard items (which emit their own billboard_* events) are not,
    // so their CTR denominator never gets an orphaned exposure.
    expect(keys).not.toContain('billboard-promo');
  }, 20000);
});
