import { matchRoutes } from 'react-router';

import { desktopRoutes } from '@/spa/router/desktopRouter.config';
import { getRouteMetaFromHandle } from '@/spa/router/routeMeta';

/**
 * Whether `pathname` matches a route that declares a persistent portal column.
 *
 * The table-based twin of the `useMatches` check in `usePortalColumnHost`. It
 * exists because on the desktop build the shell — and with it `GlobalOverlays` —
 * is window-level, while pages live in per-tab memory routers. The drawer's own
 * `useMatches` therefore sees the window router, whose main-area entries are
 * `{ element: null }` stubs, and would answer "no column" on every Electron
 * route: the fix would hold on Web and quietly do nothing on desktop.
 *
 * Matching the table handles the `/:workspaceSlug/tasks` mirror too, where a
 * first-segment check would not.
 */
export const portalColumnForPath = (pathname: string): boolean =>
  (matchRoutes(desktopRoutes, pathname) ?? []).some(
    (match) => getRouteMetaFromHandle(match.route.handle)?.portalColumn === true,
  );
