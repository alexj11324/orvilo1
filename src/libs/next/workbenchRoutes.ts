const AGENT_DOCUMENT_ROUTE = /^\/agent\/[^/]+\/docs\/[^/]+\/?$/;

const pathOnly = (pathname: string) => pathname.split(/[?#]/, 1)[0]!;

/**
 * Every path that must reach Workbench, including the mobile-only agent
 * documents.
 *
 * The standalone `/verify` tree used to be an unconditional member — it was
 * retired with the standalone Acceptance / Verify platform, and no path needs
 * Workbench for every user agent any more. The reader that is left is
 * device-gated: desktop and Electron already serve `/agent/:aid/docs/:docId`
 * from the main router (`desktopRouter.shared.tsx`), and only the mobile
 * bundle, which has no document route of its own, is handed to Workbench.
 */
export const isWorkbenchSpaRoute = (pathname: string): boolean => {
  const path = pathOnly(pathname);

  return AGENT_DOCUMENT_ROUTE.test(path);
};
