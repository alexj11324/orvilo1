import { createElement, memo } from 'react';

// Document defaults consume the same resolved roles as body portals. Keep them
// in the reset layer so public component styles and the app's viewport rules win.
const baseResetStyles = `
  @layer base {
    :root {
      --font-settings: 'cv01', 'tnum', 'kern';
      --font-variations: 'opsz' auto, tabular-nums;

      font-synthesis: style;
      text-autospace: normal;
    }

    html {
      overscroll-behavior: none;
    }

    html:not([data-theme='dark']):not(.dark) {
      color-scheme: light;
    }

    html[data-theme='dark'],
    html.dark {
      color-scheme: dark;
    }

    body {
      overflow: hidden auto;

      min-height: 100vh;
      margin: 0;
      padding: 0;

      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-feature-settings: var(--font-settings);
      font-variation-settings: var(--font-variations);
      font-optical-sizing: auto;
      font-kerning: normal;
      font-variant-ligatures: common-ligatures contextual;
      font-variant-numeric: tabular-nums;
      font-size-adjust: from-font;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: calc(22 / 14);
      color: var(--foreground);
      text-wrap: pretty;
      text-size-adjust: 100%;
      text-rendering: optimizelegibility;
      overflow-wrap: anywhere;
      vertical-align: baseline;

      background-color: var(--background);

      font-synthesis: style;

      -webkit-overflow-scrolling: touch;
      -webkit-tap-highlight-color: transparent;
    }

    code,
    kbd,
    samp,
    pre {
      font-family: var(--font-mono);
      font-feature-settings: 'liga' 0, 'calt' 0;
      font-variant-ligatures: none;
    }

    code span,
    kbd span,
    samp span,
    pre span {
      font-family: var(--font-mono);
    }

    ::selection {
      color: var(--primary-foreground);
      background: var(--primary);
      -webkit-text-fill-color: currentColor;
    }

    * {
      scrollbar-color: var(--scrollbar-fill) transparent;
      scrollbar-width: thin;
      box-sizing: border-box;
      vertical-align: baseline;
    }
  }
`;

// Render the static sheet during SSR as well as the first client mount. Existing
// ThemeRoles updates its variables; no duplicate theme subscription is needed.
export const BaseGlobalStyle = memo(() =>
  createElement('style', { 'data-orvilo-base-reset': '' }, baseResetStyles),
);
