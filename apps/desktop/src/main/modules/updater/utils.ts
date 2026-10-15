const STATIC_ASSET_PATH_PREFIXES = ['/assets/', '/_next/', '/static/'];
const ROOT_STATIC_FILE_RE = /^\/[^/][^./]*\.[^/]+$/;

const isStaticAssetPath = (pathname: string) =>
  ROOT_STATIC_FILE_RE.test(pathname) ||
  STATIC_ASSET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/**
 * Extract a restorable SPA route (`pathname + search`) from a renderer window URL.
 * Returns `null` when the URL is not a restorable route — splash/error pages
 * (`file:` protocol), known static asset paths, or the root route (identical
 * to the default, nothing worth restoring).
 */
export const extractRestoreRoute = (rawUrl: string): string | null => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol === 'file:') return null;
  if (isStaticAssetPath(url.pathname)) return null;

  // `lng` is re-appended by Browser.buildUrlWithLocale on the next load
  url.searchParams.delete('lng');

  const route = `${url.pathname}${url.search}`;
  if (route === '/' || route === '') return null;

  return route;
};
