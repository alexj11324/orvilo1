import { memo, useEffect } from 'react';

/**
 * The webfonts the lobehub ThemeProvider used to load from a package CDN
 * (`enableCustomFonts`). `HarmonyOS Sans SC` is part of the Simplified
 * Chinese stack in `src/const/font.ts`. KaTeX styles are bundled by the
 * Markdown component instead.
 *
 * Links are appended after mount, like the vendor FontLoader did: a React 19
 * `precedence` stylesheet would suspend the app until the CDN answers.
 */
const WEBFONTS = [
  { path: 'css/index.css', pkg: '@lobehub/webfont-mono', version: '1.0.0' },
  { path: 'css/index-full.css', pkg: '@lobehub/webfont-harmony-sans', version: '1.0.0' },
  { path: 'css/index.css', pkg: '@lobehub/webfont-harmony-sans-sc', version: '1.0.0' },
] as const;

type Webfont = (typeof WEBFONTS)[number];

export const webfontUrl = ({ path, pkg, version }: Webfont, globalCDN?: boolean) =>
  globalCDN
    ? `https://unpkg.com/${pkg}@${version}/${path}`
    : `https://registry.npmmirror.com/${pkg}/${version}/files/${path}`;

/** Appends `<link rel="stylesheet">` once per URL; safe to call repeatedly. */
export const loadStylesheet = (href: string) => {
  if (typeof document === 'undefined') return;
  const loaded = [...document.head.querySelectorAll<HTMLLinkElement>('link[data-orvilo-font]')];
  if (loaded.some((link) => link.getAttribute('href') === href)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.orviloFont = '';
  document.head.append(link);
};

interface CdnWebFontsProps {
  /** An extra font stylesheet, e.g. the deployment's custom font URL. */
  customFontURL?: string;
  /** Load the default webfonts; `false` keeps only `customFontURL`. */
  enabled?: boolean;
  /** Use unpkg instead of the default npmmirror registry. */
  globalCDN?: boolean;
}

const CdnWebFonts = memo<CdnWebFontsProps>(({ customFontURL, enabled = true, globalCDN }) => {
  useEffect(() => {
    if (enabled) for (const font of WEBFONTS) loadStylesheet(webfontUrl(font, globalCDN));
    if (customFontURL) loadStylesheet(customFontURL);
  }, [customFontURL, enabled, globalCDN]);

  return null;
});

CdnWebFonts.displayName = 'CdnWebFonts';

export default CdnWebFonts;
