// Deep import on purpose: the package root barrel uses extensionless relative
// imports that Node's type-stripping loader (which evaluates externalized
// config-time imports) cannot resolve. branding.ts is a dependency-free leaf
// exposed via the './branding' subpath — keep it import-free.
import { BRANDING_NAME } from '@orvilo/business-const/branding';
import type { Plugin } from 'vite';

// The static loading screen ships as an empty marker: it draws nothing on its
// own, so the default build has no artwork to flash before the SPA boots.
const EMPTY_LOADING_SCREEN = /<div id="loading-screen">\s*<\/div>/;

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * Render the brand name inside the otherwise-empty static loading screen, so
 * white-label deployments (BRANDING_NAME !== 'LobeHub') show their own name
 * instead of a blank frame while the SPA boots.
 *
 * A no-op for the default branding, which intentionally shows nothing, and for
 * the entries that carry no loading screen at all (`index.auth.html`,
 * `index.workbench.html`, `index.mobile.html`, `apps/share/index.html`,
 * `apps/workbench/index.html`, `apps/desktop/overlay.html`).
 *
 * The anchor is the empty marker rather than the root entry, so it also matches
 * `apps/desktop/{index,popup}.html`. Those are not inputs of this Vite project
 * and their `<style>` has no `#loading-brand` rule, so an injection there would
 * land uncentred — unreachable today, and the reason to narrow the anchor if a
 * second consumer ever shows up.
 *
 * The silence below is covered by a test asserting against the real
 * `index.html`, so the marker cannot be reshaped without this plugin being
 * updated with it.
 */
export const customBrandingLoadingScreen = (): Plugin => ({
  name: 'custom-branding-loading-screen',
  transformIndexHtml: {
    handler(html) {
      if (BRANDING_NAME === 'LobeHub') return html;
      if (!EMPTY_LOADING_SCREEN.test(html)) return html;

      return html.replace(
        EMPTY_LOADING_SCREEN,
        `<div id="loading-screen"><div id="loading-brand" aria-label="Loading" role="status" style="font-size: 26px; font-weight: 700; letter-spacing: 0.02em;">${escapeHtml(
          BRANDING_NAME,
        )}</div></div>`,
      );
    },
    order: 'pre',
  },
});
