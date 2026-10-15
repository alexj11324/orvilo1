/** App document policy. Trigger classes are the installed SDK's published CLASSNAMES contract. */
const global = `
  html,
  body,
  #__next {
    position: relative;

    overscroll-behavior: none;

    height: 100%;
    min-height: 100dvh;
    max-height: 100dvh;

    @media (device-width >= 576px) {
      overflow: hidden;
    }
  }

  body {
    /* Own stacking context, otherwise render black edges will appear. Must NOT
       be a transform-based hack: a transform on body rebases every position:
       fixed descendant onto body, and a drawer panel mid slide-in then overflows
       body horizontally — focusing it scrolls the whole page sideways. */
    will-change: opacity;
    isolation: isolate;
  }

  /* Resets live in @layer base so Tailwind/ReUI utilities and antd (layer antd) can override them. */
  @layer base {
    * {
      scrollbar-color: var(--scrollbar-fill) transparent;
      scrollbar-width: thin;

      ::-webkit-scrollbar {
        width: 0.75em;
        height: 0.75em;
      }

      ::-webkit-scrollbar-thumb {
        border-radius: 9999px;
      }

      :hover::-webkit-scrollbar-thumb {
        border: 3px solid transparent;
        background-color: var(--foreground);
        background-clip: content-box;
      }

      ::-webkit-scrollbar-track {
        background-color: transparent;
      }
    }
  }

  html.desktop[data-theme='dark'] body {
    background-color: color-mix(in srgb, var(--background) 50%, transparent);
  }

  html.desktop[data-theme='light'] body {
    background-color: color-mix(in srgb, var(--background) 70%, transparent);
  }

  button {
    -webkit-app-region: no-drag;
  }

  .lobe-context-trigger[data-popup-open]:not([data-no-highlight]),
  .lobe-dropdown-menu-trigger[data-popup-open]:not([data-no-highlight]) {
    background: var(--accent);
  }
  .accordion-action:has(
    .lobe-dropdown-menu-trigger[data-popup-open]:not([data-no-highlight])
  ) {
    opacity: 1;
  }
`;

export default global;
