import type { Plugin, ViteDevServer } from 'vite';

const DESKTOP_HTML = '/apps/desktop/index.html';
const OVERLAY_HTML = '/apps/desktop/overlay.html';
const POPUP_HTML = '/apps/desktop/popup.html';

/** Module namespaces Vite serves from the project root. */
const VITE_MODULE_PREFIXES = ['/@', '/src/', '/node_modules/', '/apps/', '/packages/'];

const hasViteModulePrefix = (pathname: string) =>
  VITE_MODULE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/**
 * Guards the popup deep-link rewrite. Deliberately broad — any dotted last
 * segment counts as a file — because that is the behaviour that rewrite already
 * shipped with. The document fallback below uses `isFilePath` instead, which is
 * the same idea scoped to paths that really are files.
 */
const looksLikeAsset = (pathname: string) => {
  const lastSegment = pathname.split('/').pop() ?? '';

  return lastSegment.includes('.') || hasViteModulePrefix(pathname);
};

/** Static asset directories, mirroring the updater's own list. */
const STATIC_ASSET_PREFIXES = ['/assets/', '/_next/', '/static/'];

/**
 * Whether Vite answers this path with a real file.
 *
 * A dotted segment *deeper* in the path is not a file. The updater treats
 * `/community/skill/github.owner.repo` as a route slug to restore and only a
 * root-level filename as static (see `apps/desktop/src/main/modules/updater/utils.ts`).
 * Applying the dot test to nested segments would hand those routes to the SPA
 * fallback — the very outcome this module exists to prevent.
 */
/**
 * `/favicon.ico`: one path segment, a dot, and content on both sides of it.
 *
 * Written out rather than as `/^\/[^/]+\.[^/]+$/` because that pattern is
 * ambiguous — `[^/]` matches `.` too — and lint rewrites it into the narrower
 * `[^/][^./]*\.[^/]+`, which rejects a root-level `/sitemap.xml.gz`.
 */
const isRootLevelFilename = (pathname: string) => {
  const [first, ...rest] = pathname.split('/').filter(Boolean);
  if (!first || rest.length > 0) return false;

  const dot = first.indexOf('.');

  return dot > 0 && dot < first.length - 1;
};

const isFilePath = (pathname: string) =>
  isRootLevelFilename(pathname) ||
  STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
  hasViteModulePrefix(pathname);

/**
 * Map an incoming dev-server request to the HTML document that should answer it,
 * or `undefined` to leave the request untouched.
 *
 * The renderer dev server runs with the monorepo root as its `root`, so without
 * this mapping Vite's SPA fallback answers a desktop deep link with the repo-root
 * `index.html` — the WEB entry — and an Electron window boots the wrong SPA.
 */
export const resolveDesktopHtml = (
  rawUrl: string,
  accept: string | undefined,
  secFetchDest: string | undefined,
): string | undefined => {
  const pathname = rawUrl.split('?')[0];

  // Explicit document entries — always rewritten, whatever the headers say.
  if (pathname === '/' || pathname === '/index.html') return DESKTOP_HTML;
  if (pathname === '/overlay' || pathname === '/overlay.html') return OVERLAY_HTML;
  if (pathname === '/popup.html') return POPUP_HTML;

  // Deep link into the topic popup SPA (e.g. `/popup/agent/A/T`).
  if (!looksLikeAsset(pathname) && (pathname === '/popup' || pathname.startsWith('/popup/'))) {
    return POPUP_HTML;
  }

  // Any other deep link (`/desktop-onboarding?screen=welcome`,
  // `/community/skill/github.owner.repo`) has no file of its own.
  //
  // Only document navigations qualify: answering a subresource request with a
  // document would swap a module for a page. Both signals are honoured because
  // proxies differ in which one they preserve, and each is pinned alone by a test.
  const isDocumentNavigation = secFetchDest === 'document' || (accept ?? '').includes('text/html');

  if (!isDocumentNavigation) return undefined;

  // A real file is still served by Vite as-is (`/not-compatible.html`,
  // `/favicon.ico`, `/assets/…`).
  if (isFilePath(pathname)) return undefined;

  return DESKTOP_HTML;
};

/**
 * Rewrite SPA routes to their corresponding HTML entry so the Vite dev server
 * serves the right HTML when `root` is the monorepo root.
 */
export const electronDesktopHtmlPlugin = (): Plugin => ({
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req, _res, next) => {
      const target = resolveDesktopHtml(
        req.url ?? '',
        req.headers.accept,
        req.headers['sec-fetch-dest'],
      );

      if (target) req.url = target;
      next();
    });
  },
  name: 'electron-desktop-html',
});
