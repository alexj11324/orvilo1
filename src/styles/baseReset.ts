import { createGlobalStyle, css } from 'antd-style';

/**
 * Repo-owned copy of the document-level reset that `@lobehub/ui` ThemeProvider
 * injects through `GlobalStyle` (ThemeProvider/GlobalStyle/global). The
 * ThemeProvider is rendered with `enableGlobalStyle={false}` and this takes its place.
 *
 * Only the universal `*` rule moved: it now sits in `@layer base`, so antd
 * (layer `antd`), Tailwind components and utilities can override it. An
 * unlayered `*` rule beats every layered rule regardless of specificity, which
 * is what forced per-component overrides (scrollbar-width, vertical-align).
 * `html`, `body`, `code` and `::selection` stay unlayered to keep today's
 * cascade against the `body` rule in `globals.css`.
 *
 * See docs/development/antd-global-style-layer.md.
 */
export const BaseGlobalStyle = createGlobalStyle(
  ({ theme: token }) => css`
    :root {
      --font-settings: 'cv01', 'tnum', 'kern';
      --font-variations: 'opsz' auto, tabular-nums;

      /* Real Geist italic for Latin; synthesize style for CJK fallback faces. */
      font-synthesis: style;
      text-autospace: normal;
    }

    html {
      overscroll-behavior: none;
      color-scheme: ${token.isDarkMode ? 'dark' : 'light'};
    }

    body {
      overflow: hidden auto;

      min-height: 100vh;
      margin: 0;
      padding: 0;

      font-family: ${token.fontFamily};
      font-size: ${token.fontSize}px;
      font-feature-settings: var(--font-settings);
      font-variation-settings: var(--font-variations);
      font-optical-sizing: auto;
      font-kerning: normal;
      font-variant-ligatures: common-ligatures contextual;
      font-variant-numeric: tabular-nums;
      font-size-adjust: from-font;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1;
      color: ${token.colorTextBase};
      text-wrap: pretty;
      text-size-adjust: 100%;
      text-rendering: optimizelegibility;
      overflow-wrap: anywhere;
      vertical-align: baseline;

      background-color: ${token.colorBgLayout};

      font-synthesis: style;

      -webkit-overflow-scrolling: touch;
      -webkit-tap-highlight-color: transparent;
    }

    code,
    kbd,
    samp,
    pre {
      font-family: ${token.fontFamilyCode} !important;
      font-feature-settings:
        'liga' 0,
        'calt' 0;
      font-variant-ligatures: none;

      span {
        font-family: ${token.fontFamilyCode} !important;
      }
    }

    ::selection {
      color: #000;
      background: ${token.yellow9};

      -webkit-text-fill-color: unset !important;
    }

    @layer base {
      * {
        scrollbar-color: ${token.colorFill} transparent;
        scrollbar-width: thin;
        box-sizing: border-box;
        vertical-align: baseline;
      }
    }
  `,
);
