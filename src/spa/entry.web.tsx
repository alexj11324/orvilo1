import '../initialize';
import '@/app/globals.css';

import { RouterProvider } from 'react-router/dom';

import BootErrorBoundary from '@/components/BootErrorBoundary';
import NextThemeProvider from '@/layout/GlobalProvider/NextThemeProvider';
import { bootTiming } from '@/libs/bootTiming';
import { createWebHostPort, registerHostPort } from '@/platform';
import { createAppRouter } from '@/utils/router';

import BootShell from './BootShell';
import { isMainLayoutLocation } from './BootShell/routeScope';
import { startAppInitialization } from './initialize/bootstrap';
import { desktopRoutes } from './router/desktopRouter.config';
import { createSPARoot } from './runtime';

// Composition root: inject the browser host before any product code can ask
// for a shell capability. Never import the desktop adapter here — the web
// bundle must not reach Electron services.
registerHostPort(createWebHostPort());
bootTiming.mark('bundle-eval');
startAppInitialization();

const debugProxyBase = '/_dangerous_local_dev_proxy';
const basename =
  window.__DEBUG_PROXY__ || window.location.pathname.startsWith(debugProxyBase)
    ? debugProxyBase
    : undefined;

const router = createAppRouter(desktopRoutes, { basename });

// Mounting is conditional rather than an early return inside the shell: the hook
// also strips the static logo, and a standalone route needs that logo to stay up
// until its own brand-loading fallback takes over.
const showBootShell = isMainLayoutLocation(desktopRoutes, window.location.pathname, basename);

createSPARoot(document.getElementById('root')!).render(
  <BootErrorBoundary>
    <NextThemeProvider>
      {showBootShell && <BootShell />}
      <RouterProvider router={router} />
    </NextThemeProvider>
  </BootErrorBoundary>,
);
