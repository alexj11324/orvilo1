import { Children, type FC, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import WebLayout from './index';
import DesktopLayout from './index.desktop';

const { nullComponent, passthrough } = vi.hoisted(() => ({
  nullComponent: () => ({ default: () => null }),
  passthrough: () => ({ default: ({ children }: { children?: unknown }) => children }),
}));

vi.mock('@/const/version', () => ({ isDesktop: true }));
vi.mock('@/hooks/usePlatform', () => ({ usePlatform: () => ({ isPWA: false }) }));
vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: () => ({ showCloudPromotion: false }),
  useServerConfigStore: (selector: (s: unknown) => unknown) => selector({}),
}));
vi.mock('@/libs/next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/features/Electron/shell', () => ({
  useDesktopDocumentTitle: () => {},
  useLastWorkspaceSlugSync: () => {},
  useWindowUrlMirror: () => {},
}));
vi.mock('@/features/Electron/TabHost', () => ({
  TabHost: () => null,
  useSeedTabsOnBoot: () => {},
}));
vi.mock('@/features/ResourceManager/DndContextWrapper', () => ({ DndContextWrapper: () => null }));
vi.mock('@/features/AlertBanner/CloudBanner', () => ({ BANNER_HEIGHT: 0, default: () => null }));
vi.mock('@/features/RouteMeta', () => ({ RouteMetaBridge: () => null }));
vi.mock('./style', () => ({ styles: {} }));
vi.mock('react-router', () => ({ Outlet: () => null }));

vi.mock('@/components/Skeleton/RouteSegment', nullComponent);
vi.mock('@/features/DesktopFileMenuBridge', nullComponent);
vi.mock('@/features/DesktopLayoutContainer', passthrough);
vi.mock('@/features/DesktopNavigationBridge', nullComponent);
vi.mock('@/features/Electron/ActiveConversationBridge', nullComponent);
vi.mock('@/features/Electron/ScreenCapture/OverlayCaptureUploader', nullComponent);
vi.mock('@/features/Electron/ScreenCapture/OverlayMessageDispatcher', nullComponent);
vi.mock('@/features/Electron/ScreenCapture/OverlaySnapshotPublisher', nullComponent);
vi.mock('@/features/Electron/system/ZoomHUD', nullComponent);
vi.mock('@/features/Electron/titlebar/TabBar/TabCacheBridges', nullComponent);
vi.mock('@/features/Electron/titlebar/TitleBar', nullComponent);
vi.mock('@/features/GlobalOverlays', nullComponent);
vi.mock('@/features/HotkeyHelperPanel', nullComponent);
vi.mock('@/features/NavPanel/Shell', nullComponent);
vi.mock('@/layout/GlobalProvider/CmdkLazy', nullComponent);
vi.mock('./RegisterHotkeys', nullComponent);
vi.mock('../home', nullComponent);
vi.mock('../home/_layout', passthrough);

const nameOf = (type: unknown): string | undefined =>
  (type as { displayName?: string; name?: string } | null)?.displayName ??
  (type as { name?: string } | null)?.name;

const findByName = (
  node: ReactNode,
  name: string,
): ReactElement<{ children?: ReactNode }> | undefined => {
  let hit: ReactElement<{ children?: ReactNode }> | undefined;
  Children.forEach(node, (child) => {
    if (hit || !isValidElement(child)) return;
    if (nameOf(child.type) === name) {
      hit = child as ReactElement<{ children?: ReactNode }>;
      return;
    }
    hit = findByName((child.props as { children?: ReactNode }).children, name);
  });
  return hit;
};

/**
 * Imported statically on purpose. Loaded with `await import(...)` inside the
 * test body, the two layout graphs are evaluated *within* the timeout budget,
 * and the desktop one costs ~26s against a 20s budget — a red test that says
 * nothing about where auth recovery is mounted. Imported at the top of the file,
 * `vi.mock` being hoisted still lands the mocks first, and the evaluation moves
 * into collection, which no `testTimeout` governs.
 */
const layouts = [
  ['desktop', DesktopLayout],
  ['web', WebLayout],
] as const;

describe.each(layouts)('main layout (%s)', (_name, Layout) => {
  it('keeps the desktop OIDC boot hook outside WorkspaceContextSlot so a blocked shell cannot hide it', async () => {
    const tree = await (Layout as FC)({});
    const slot = findByName(tree, 'WorkspaceContextSlot');

    // The pair below is self-guarding: the first `findByName` fails the test if
    // the traversal cannot find the component anywhere, so the second cannot
    // pass merely because the traversal is broken.
    expect(slot).toBeDefined();
    expect(findByName(tree, 'DesktopAutoOidcOnFirstOpen')).toBeDefined();
    expect(findByName(slot!.props.children, 'DesktopAutoOidcOnFirstOpen')).toBeUndefined();
  });

  it('leaves session-auth recovery to the global provider — it must cover routes without this layout', async () => {
    // `/onboarding` (and the mobile/popup entries) never render this layout, so
    // AuthRequiredModal/WebSessionAuthRecovery mount in SPAGlobalProvider
    // instead; nothing session-auth related belongs inside the slot either.
    const tree = await (Layout as FC)({});
    expect(findByName(tree, 'AuthRequiredModal')).toBeUndefined();
    expect(findByName(tree, 'WebSessionAuthRecovery')).toBeUndefined();
  });
});
