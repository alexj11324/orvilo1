import { isWorkbenchSpaRoute } from './workbenchRoutes';

/**
 * Whether a link to `pathname` has to leave the main SPA and load Workbench as
 * its own application.
 *
 * Desktop and Electron both serve the agent document reader from the main
 * router, and the standalone `/verify` tree that used to hard-navigate for
 * every platform is retired — so this is now the mobile bundle's document
 * reader only. Anything else stays in-router.
 */
export const shouldHardNavigateToWorkbench = (pathname: string): boolean => {
  if (typeof __ELECTRON__ !== 'undefined' && __ELECTRON__) return false;

  return typeof __MOBILE__ !== 'undefined' && __MOBILE__ && isWorkbenchSpaRoute(pathname);
};
