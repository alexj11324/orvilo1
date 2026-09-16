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
const inputAreaStub = {
  default: ({
    mode,
    showNewModelShortcuts,
  }: {
    mode?: string;
    showNewModelShortcuts?: boolean;
  }) => (
    <div data-mode={mode} data-testid={'home-input-area'}>
      {mode === 'chat' && showNewModelShortcuts && <div data-testid={'new-model-shortcuts'} />}
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

  it('opens the home dashboard in chat mode by default', async () => {
    await renderHome();

    expect(screen.getByTestId('home-input-area')).toHaveAttribute('data-mode', 'chat');
    expect(screen.getByTestId('home-mode-content')).toHaveAttribute('data-mode', 'chat');
    expect(screen.getByTestId('new-model-shortcuts')).toBeInTheDocument();
  }, 20000);

  it('opens the home dashboard in task mode for the post-onboarding entry', async () => {
    await renderHome({ search: '?onboarding=task' });

    expect(screen.getByTestId('home-input-area')).toHaveAttribute('data-mode', 'task');
    expect(screen.getByTestId('home-mode-content')).toHaveAttribute('data-mode', 'task');
    expect(screen.queryByTestId('new-model-shortcuts')).not.toBeInTheDocument();
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
