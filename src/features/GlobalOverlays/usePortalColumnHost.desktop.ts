'use client';

import { selectActiveTabUrl } from '@/features/Electron/shell/activeTabUrl';
import { type ElectronStore, useElectronStore } from '@/store/electron';

import { portalColumnForPath } from './portalColumnRoute';

const selectActiveTabPathname = (s: ElectronStore): string | null => {
  const url = selectActiveTabUrl(s);
  if (!url) return null;

  const queryIndex = url.search(/[#?]/);
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
};

/**
 * Desktop override of `usePortalColumnHost`.
 *
 * The base version asks the router, and on Electron that would be the wrong
 * router: the shell — and with it `GlobalOverlays`, which renders the acceptance
 * drawer — is window-level, while each tab owns a memory router. The window
 * router's main-area entries are `{ element: null }` stubs, so `useMatches` would
 * report no portal column on every desktop route and the drawer would keep
 * duplicating there, silently, while Web looked fixed.
 *
 * So the pathname is taken from the active tab and resolved against the route
 * table instead — the same split, for the same reason, as
 * `useWorkspaceSyncPathname.desktop.ts`, including the fall back to the window url
 * for the frame before `useSeedTabsOnBoot` fills the tab list.
 */
export const usePortalColumnHost = (): boolean => {
  const pathname = useElectronStore(selectActiveTabPathname);

  return portalColumnForPath(pathname ?? window.location.pathname);
};
