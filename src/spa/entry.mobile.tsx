import '../initialize';

import { RouterProvider } from 'react-router/dom';

import NextThemeProvider from '@/layout/GlobalProvider/NextThemeProvider';
import { bootTiming } from '@/libs/bootTiming';
import { createAppRouter } from '@/utils/router';

import { startAppInitialization } from './initialize/bootstrap';
import { mobileRoutes } from './router/mobileRouter.config';
import { createSPARoot } from './runtime';

bootTiming.mark('bundle-eval');
startAppInitialization();

// Same debug-proxy basename handling as entry.web: the `_dangerous_local_dev_proxy`
// page mounts the bundle at that path, which would otherwise be parsed as a
// `:workspaceSlug` segment and land on "Unknown Territory".
const debugProxyBase = '/_dangerous_local_dev_proxy';
const basename =
  window.__DEBUG_PROXY__ || window.location.pathname.startsWith(debugProxyBase)
    ? debugProxyBase
    : undefined;

const router = createAppRouter(mobileRoutes, { basename });

createSPARoot(document.getElementById('root')!).render(
  <NextThemeProvider>
    <RouterProvider router={router} />
  </NextThemeProvider>,
);
