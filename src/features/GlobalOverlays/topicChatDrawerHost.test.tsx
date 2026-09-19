/**
 * @vitest-environment happy-dom
 *
 * One open topic must render exactly one run panel per page/tab.
 *
 * The panel is viewport-anchored, so it does not matter which component
 * declares it — what matters is how many instances are allowed to. These tests
 * count rendered panels rather than assert wiring: `TopicChatDrawer` is the real
 * component (with the panel library mocked down to a countable root), the
 * context is the real one, and the last case renders the real `(main)` layout.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import TopicChatDrawer from '@/features/AgentTasks/AgentTaskDetail/TopicChatDrawer';
import MainLayout from '@/routes/(main)/_layout';

import { GlobalOverlayHostContext } from './globalHostContext';

/**
 * Component stubs live in `vi.hoisted` too: `vi.mock` factories are hoisted
 * above the imports, so a plain top-level `const` would still be in its TDZ
 * when the factory returns `{ default: nullComponent }`.
 */
const { nullComponent, passthrough } = vi.hoisted(() => ({
  nullComponent: () => null,
  passthrough: ({ children }: { children?: unknown }) => children,
}));

const mocks = vi.hoisted(() => ({
  agentState: {
    useHydrateAgentConfig: vi.fn(),
  },
  chatState: {
    dbMessagesMap: {} as Record<string, unknown[]>,
    // `GlobalOverlays` asks the portal stack whether an acceptance view is open
    // before it mounts that drawer; an empty stack keeps it out of this tree.
    portalStack: [] as unknown[],
    replaceMessages: vi.fn(),
  },
  navigate: vi.fn(),
  /**
   * The page slot the layout hands its `<Outlet/>`. Populated in `beforeAll`,
   * once module evaluation is done, so the `react-router` mock factory (hoisted
   * above the imports) can reference it without touching a binding in its TDZ.
   */
  outlet: { page: (() => null) as () => ReactNode },
  serverConfigState: {
    featureFlags: { showCloudPromotion: false },
    serverConfig: { enableBusinessFeatures: false },
  },
  taskState: {
    // Deliberately explicit: the drawer only opens with both a topic and an
    // agent, and the count below is only meaningful while it is open.
    activeTaskId: 'T-1',
    activeTopicDrawerAgentId: 'agt_drawer',
    activeTopicDrawerTaskId: undefined as string | undefined,
    activeTopicDrawerTopicId: 'topic-1' as string | undefined,
    closeTopicDrawer: vi.fn(),
    deleteTopic: vi.fn(),
    taskDetailMap: {} as Record<string, unknown>,
    useFetchTaskDetail: vi.fn(),
  },
  userState: { isSignedIn: true },
}));

/**
 * The panel root. Rendering it only while `open` keeps the count equal to the
 * number of *visible* panels, which is what the duplicate-host bug looked like
 * on screen: two stacked panels for one topic.
 */
vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FloatingPanel: ({ open }: { open?: boolean; styles?: { panel?: CSSProperties } }) =>
    open ? <div data-testid="topic-panel" /> : null,
}));

// --- the real `(main)` layout's leaves -------------------------------------
vi.mock('@/const/version', () => ({ isDesktop: false }));
vi.mock('@/hooks/usePlatform', () => ({ usePlatform: () => ({ isPWA: false }) }));
vi.mock('@/libs/next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/features/AlertBanner/CloudBanner', () => ({ BANNER_HEIGHT: 0, default: nullComponent }));
vi.mock('@/features/DesktopLayoutContainer', () => ({ default: passthrough }));
vi.mock('@/features/Electron/AuthRequiredModal', () => ({ default: nullComponent }));
vi.mock('@/features/HotkeyHelperPanel', () => ({ default: nullComponent }));
vi.mock('@/features/NavPanel/Shell', () => ({ default: nullComponent }));
vi.mock('@/features/ResourceManager/DndContextWrapper', () => ({ DndContextWrapper: passthrough }));
vi.mock('@/features/RouteMeta', () => ({ RouteMetaBridge: nullComponent }));
vi.mock('@/components/Skeleton/RouteSegment', () => ({ default: nullComponent }));
vi.mock('@/layout/GlobalProvider/CmdkLazy', () => ({ default: nullComponent }));
vi.mock('@/routes/(main)/_layout/DesktopAutoOidcOnFirstOpen', () => ({ default: nullComponent }));
vi.mock('@/routes/(main)/_layout/RegisterHotkeys', () => ({ default: nullComponent }));
vi.mock('@/routes/(main)/_layout/style', () => ({ styles: {} }));
vi.mock('@/hooks/useSyncRecents', () => ({ useSyncRecents: vi.fn() }));

/**
 * The `<Outlet/>` stands in for the page the layout resolves. Rendering a plain
 * `<TopicChatDrawer />` here is exactly what `TaskDetailPage`,
 * `AutomationDetailPage` and the two portal bodies declare — so this tree is
 * the real thing: layout + page-level instance + `GlobalOverlays` host.
 */
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Outlet: () => mocks.outlet.page(),
  // The layout's workspace URL sync reads the router pathname and a navigate
  // handle; this tree is rendered without a Router, so feed both stubs.
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => () => undefined,
}));

// --- the real `TopicChatDrawer`'s leaves -----------------------------------
vi.mock('@/features/Conversation/ChatList', () => ({ default: nullComponent }));
vi.mock('@/features/Conversation/ConversationProvider', () => ({
  ConversationProvider: passthrough,
}));
vi.mock('@/features/Conversation/Markdown/plugins/Task', () => ({
  TaskCardScopeProvider: passthrough,
}));
vi.mock('@/features/Conversation/Messages', () => ({ default: nullComponent }));
vi.mock('@/features/ShareModal', () => ({ useShareModal: () => ({ openShareModal: vi.fn() }) }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/hooks/useGatewayReconnect', () => ({ useGatewayReconnect: vi.fn() }));
vi.mock('@/hooks/useOperationState', () => ({ useOperationState: () => undefined }));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true, reason: 'requires member' }),
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: typeof mocks.agentState) => unknown) =>
    selector(mocks.agentState),
}));
vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: typeof mocks.chatState) => unknown) => selector(mocks.chatState),
}));
// One mock serves both readers: the layout reads `featureFlagsSelectors`, the
// drawer reads `serverConfigSelectors.enableBusinessFeatures`.
vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: (state: typeof mocks.serverConfigState) => state.featureFlags,
  useServerConfigStore: (selector: (state: typeof mocks.serverConfigState) => unknown) =>
    selector(mocks.serverConfigState),
}));
vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: typeof mocks.taskState) => unknown) => selector(mocks.taskState),
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: typeof mocks.userState) => unknown) => selector(mocks.userState),
}));
vi.mock('@/store/chat/utils/messageMapKey', () => ({ messageMapKey: () => 'topic-chat-key' }));
vi.mock('@/features/AgentTasks/features/AssigneeAvatar', () => ({ default: nullComponent }));
vi.mock('@/features/AgentTasks/AgentTaskDetail/TopicChatDrawer/FeedbackInput', () => ({
  default: nullComponent,
}));

beforeAll(() => {
  mocks.outlet.page = () => <TopicChatDrawer />;
});

beforeEach(() => {
  mocks.taskState.activeTopicDrawerAgentId = 'agt_drawer';
  mocks.taskState.activeTopicDrawerTaskId = undefined;
  mocks.taskState.activeTopicDrawerTopicId = 'topic-1';
  mocks.taskState.useFetchTaskDetail.mockClear();
});

afterEach(() => {
  cleanup();
});

const withHost = (node: ReactNode) => (
  <GlobalOverlayHostContext value={true}>{node}</GlobalOverlayHostContext>
);

describe('TopicChatDrawer hosts', () => {
  it('keeps a page-level drawer from opening a panel inside the global host tree', () => {
    render(withHost(<TopicChatDrawer />));

    expect(screen.queryAllByTestId('topic-panel')).toHaveLength(0);
  });

  it('opens exactly one panel for the host instance inside the global host tree', () => {
    render(withHost(<TopicChatDrawer asGlobalHost />));

    expect(screen.getAllByTestId('topic-panel')).toHaveLength(1);
  });

  // The mobile layouts mount no `GlobalOverlays`, so their four page-level call
  // sites are the only hosts there and must keep rendering.
  it('keeps a page-level drawer opening a panel on a tree with no global host', () => {
    render(<TopicChatDrawer />);

    expect(screen.getAllByTestId('topic-panel')).toHaveLength(1);
  });

  it('renders one panel for a real main layout holding both a page and the global host', async () => {
    // Warm-up render. The host loads its drawer through `React.lazy`, so the
    // first mount suspends and the panel pops in a commit later — counting then
    // would read a half-built tree and could pass on the page's panel alone,
    // with the host simply not there yet. This render settles the lazy payload
    // (and proves the host drawer mounts at all); the counted render below is
    // then synchronous and both instances are in the same commit.
    const warmUp = render(<MainLayout />);
    await waitFor(() =>
      expect(mocks.taskState.useFetchTaskDetail.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    warmUp.unmount();
    mocks.taskState.useFetchTaskDetail.mockClear();

    render(<MainLayout />);

    // Both instances ran — the page's and the host's — so the single panel is
    // the suppression working, not a page that never rendered.
    expect(mocks.taskState.useFetchTaskDetail).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId('topic-panel')).toHaveLength(1);
  });
});
