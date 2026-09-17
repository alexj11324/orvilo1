import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Home from '../index';

interface RenderHomeOptions {
  hiddenWidgets?: string[];
  isLogin?: boolean;
  search?: string;
}

/**
 * Per-test inputs, read by the mocks below at call time.
 *
 * Hoisted because `vi.mock` factories are hoisted above the imports and cannot
 * close over ordinary module bindings. Keeping the variation here is what lets the
 * Home module be imported **statically** — evaluated once during collection — rather
 * than re-imported inside each test body, where the graph's cost landed on
 * `testTimeout` and produced 20s timeouts under load. Same fix as
 * `Home/__tests__/inputBanner.test.tsx` and `(main)/_layout/authMount.test.ts`.
 */
const current = vi.hoisted(() => ({
  hiddenWidgets: [] as string[],
  isLogin: true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en-US' }, t: (key: string) => key }),
}));
vi.mock('../HomeHeader', async () => (await import('./homeDashboardStubs')).homeHeaderStub);
vi.mock(
  '../HomeModeContent',
  async () => (await import('./homeDashboardStubs')).homeModeContentStub,
);
vi.mock('../InputArea', async () => (await import('./homeDashboardStubs')).inputAreaStub);
vi.mock('@/features/HomeInbox', async () => (await import('./homeDashboardStubs')).homeInboxStub);

// Home only ever reaches the chat store through `getState`/`setState` since the
// drawer hosts moved to `GlobalOverlays`.
vi.mock('@/store/chat', () => ({
  useChatStore: Object.assign(vi.fn(), {
    getState: () => ({ mainInputEditor: undefined }),
    setState: vi.fn(),
  }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: unknown) => unknown) =>
    selector({ status: { hiddenHomeWidgets: current.hiddenWidgets } }),
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ isSignedIn: current.isLogin }),
}));

const renderHome = ({
  hiddenWidgets = [],
  isLogin = true,
  search = '',
}: RenderHomeOptions = {}) => {
  current.hiddenWidgets = hiddenWidgets;
  current.isLogin = isLogin;
  window.history.replaceState(null, '', `/${search}`);

  render(<Home />);
};

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('home dashboard', () => {
  it('renders its three regions', () => {
    renderHome();

    expect(screen.getByTestId('home-header')).toBeInTheDocument();
    expect(screen.getByTestId('home-main')).toBeInTheDocument();
    expect(screen.getByTestId('home-rail')).toBeInTheDocument();
  });

  // S20 L214: login, workspace creation and onboarding must stop landing on the
  // chat-style home. On Electron this page *is* the landing surface, so the mode
  // it opens in is the requirement.
  it('opens the home dashboard in task mode by default', () => {
    renderHome();

    expect(screen.getByTestId('home-input-area')).toHaveAttribute('data-mode', 'task');
    expect(screen.getByTestId('home-mode-content')).toHaveAttribute('data-mode', 'task');
    // Present in task mode too — the shortcuts follow the prop, not the mode.
    expect(screen.getByTestId('new-model-shortcuts')).toBeInTheDocument();
  });

  it('clears the legacy onboarding param instead of letting it drive the mode', () => {
    renderHome({ search: '?onboarding=task' });

    expect(screen.getByTestId('home-input-area')).toHaveAttribute('data-mode', 'task');
    expect(screen.getByTestId('home-mode-content')).toHaveAttribute('data-mode', 'task');
    // Still consumed and stripped, so a reload cannot re-apply it — it just no
    // longer changes anything, because task is now where the page opens anyway.
    expect(window.location.search).toBe('');
  });

  it('keeps model shortcuts out of the minimal layout', () => {
    renderHome({
      hiddenWidgets: [
        'goals',
        'needsYou',
        'unread',
        'running',
        'news',
        'suggestions',
        'recents',
        'tasks',
      ],
    });

    expect(screen.queryByTestId('new-model-shortcuts')).not.toBeInTheDocument();
  });
});
