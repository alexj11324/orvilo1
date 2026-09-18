'use client';

import { createContext, useContext } from 'react';

/**
 * Says "an app-wide overlay host is mounted somewhere above me".
 *
 * `GlobalOverlays` is mounted once by `(main)/_layout`, as a sibling of the
 * `<Outlet/>` that resolves to e.g. the task detail page. Viewport-anchored
 * panels (the run drawer) are also declared on those pages, so on the main tree
 * both the page-level instance and the global one would render a panel for the
 * same open topic. The provider marks the tree that already has a host, and the
 * page-level instances stand down inside it.
 *
 * The default is `false` on purpose: trees that never mount `GlobalOverlays`
 * (the mobile layouts) must keep their page-level panels. This module is a leaf
 * — it imports neither the host nor the panels, so it cannot take part in a
 * cycle with them.
 */
export const GlobalOverlayHostContext = createContext(false);

export const useGlobalOverlayHost = (): boolean => useContext(GlobalOverlayHostContext);
