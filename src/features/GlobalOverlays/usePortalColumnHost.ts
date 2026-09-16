'use client';

import { useMatches } from 'react-router';

import { getRouteMetaFromHandle } from '@/spa/router/routeMeta';

/**
 * Whether the current route already mounts a persistent portal column.
 *
 * `TaskWorkspaceLayout` renders `AgentTaskManager` — or `MobilePortal` on mobile —
 * and both show `PortalContent` for the very acceptance views the app-wide
 * `AcceptancePortalDrawer` would show, so on those routes the drawer is a second
 * host for one view.
 *
 * Asked of the router rather than matched against a list of paths: a single
 * wrapper route carries `/tasks`, `/inbox`, `/task/*` and `/goal/*`, and the
 * workspace mirror serves them all again under `/:workspaceSlug`, so a path list
 * would be wrong in three places the day someone adds a fourth.
 *
 * **On its own this is not enough to stand the drawer down.** `DraggablePanel`
 * keeps its children mounted and only sizes them to zero when collapsed
 * (`@lobehub/ui` `DraggablePanel.mjs` — `height/width: isExpand ? … : 0`), so a
 * collapsed column holds the acceptance view *invisibly*. A caller that closes
 * the drawer on `columnHost` alone would make the view unreachable; it must also
 * require the column to be expanded.
 */
export const usePortalColumnHost = (): boolean =>
  useMatches().some((match) => getRouteMetaFromHandle(match.handle)?.portalColumn === true);
