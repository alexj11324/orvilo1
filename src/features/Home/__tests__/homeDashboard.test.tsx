import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface RenderHomeOptions {
  hiddenWidgets?: string[];
  isLogin?: boolean;
  search?: string;
}

const stub = (testId: string) => ({ default: () => <div data-testid={testId} /> });
const modeStub = (testId: string) => ({
  default: ({ mode }: { mode?: string }) => <div data-mode={mode} data-testid={testId} />,
});
/**
 * Mirrors the real component: `InputArea` renders the shortcuts from the prop
 * alone (`InputArea/index.tsx:117` — `{showNewModelShortcuts && …}`) and never
 * inspects the mode. An earlier version of this stub ANDed in `mode === 'chat'`,
 * which invented a coupling the component does not have — and then the tests
 * below asserted it, so the suite "confirmed" a difference that did not exist.
 * That false difference was the only argument against defaulting Home to task
 * mode, which is why it is called out here rather than quietly fixed.
 */
const inputAreaStub = {
  default: ({
    mode,
    showNewModelShortcuts,
  }: {
    mode?: string;
    showNewModelShortcuts?: boolean;
  }) => (
    <div data-mode={mode} data-testid={'home-input-area'}>
      {showNewModelShortcuts && <div data-testid={'new-model-shortcuts'} />}
    </div>
  ),
};
const homeHeaderStub = stub('home-header');

function translate() {
  return { i18n: { language: 'en-US' }, t: (key: string) => key };
}

const renderHome = async ({
  hiddenWidgets = [],
  isLogin = true,
  search = '',
}: RenderHomeOptions = {}) => {
  vi.resetModules();
  window.history.replaceState(null, '', `/${search}`);

  vi.doMock('react-i18next', () => ({ useTranslation: translate }));
  vi.doMock('../HomeHeader', () => homeHeaderStub);
  vi.doMock('../HomeModeContent', () => modeStub('home-mode-content'));
  vi.doMock('../InputArea', () => inputAreaStub);
  vi.doMock('@/features/HomeInbox', () => stub('home-inbox'));
  // Home only ever reaches the chat store through `getState`/`setState` since
  // the drawer hosts moved to `GlobalOverlays`.
  const chatStoreMock = Object.assign(vi.fn(), {
    getState: () => ({ mainInputEditor: undefined }),
    setState: vi.fn(),
  });
  vi.doMock('@/store/chat', () => ({ useChatStore: chatStoreMock }));
  function selectFromGlobalStore(selector: (state: unknown) => unknown) {
    return selector({ status: { hiddenHomeWidgets: hiddenWidgets } });
  }
  vi.doMock('@/store/global', () => ({ useGlobalStore: selectFromGlobalStore }));
  function selectFromUserStore(selector: (state: unknown) => unknown) {
    return selector({ isSignedIn: isLogin });
  }
  vi.doMock('@/store/user', () => ({ useUserStore: selectFromUserStore }));

  const { default: Home } = await import('../index');

  render(<Home />);
};

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.doUnmock('react-i18next');
  vi.doUnmock('../HomeHeader');
  vi.doUnmock('../HomeModeContent');
  vi.doUnmock('../InputArea');
  vi.doUnmock('@/features/HomeInbox');
  vi.doUnmock('@/store/chat');
  vi.doUnmock('@/store/global');
  vi.doUnmock('@/store/user');
});

describe('home dashboard', () => {
  it('renders its three regions', async () => {
    await renderHome();

    expect(screen.getByTestId('home-header')).toBeInTheDocument();
    expect(screen.getByTestId('home-main')).toBeInTheDocument();
    expect(screen.getByTestId('home-rail')).toBeInTheDocument();
  }, 20000);

  // S20 L214: login, workspace creation and onboarding must stop landing on the
  // chat-style home. On Electron this page *is* the landing surface, so the mode
  // it opens in is the requirement.
  it('opens the home dashboard in task mode by default', async () => {
    await renderHome();

    expect(screen.getByTestId('home-input-area')).toHaveAttribute('data-mode', 'task');
    expect(screen.getByTestId('home-mode-content')).toHaveAttribute('data-mode', 'task');
    // Present in task mode too — the shortcuts follow the prop, not the mode.
    expect(screen.getByTestId('new-model-shortcuts')).toBeInTheDocument();
  }, 20000);

  it('clears the legacy onboarding param instead of letting it drive the mode', async () => {
    await renderHome({ search: '?onboarding=task' });

    expect(screen.getByTestId('home-input-area')).toHaveAttribute('data-mode', 'task');
    expect(screen.getByTestId('home-mode-content')).toHaveAttribute('data-mode', 'task');
    // Still consumed and stripped, so a reload cannot re-apply it — it just no
    // longer changes anything, because task is now where the page opens anyway.
    expect(window.location.search).toBe('');
  }, 20000);

  it('keeps model shortcuts out of the minimal layout', async () => {
    await renderHome({
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
  }, 20000);
});
