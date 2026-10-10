import { createStaticStyles, cx, keyframes } from 'antd-style';

const localTextGroupStyles = createStaticStyles(({ css }) => ({
  shinyGroup: css`
    @supports (-webkit-mask-clip: text) {
      & {
        --shiny-origin: static;

        position: relative;
      }
    }
  `,
}));

/**
 * Inspector text style — ellipsis + secondary color + flex align
 */
export const inspectorTextStyles = {
  // Keep the shared sweep coordinate group and its feature-query behavior.
  root: cx(
    localTextGroupStyles.shinyGroup,
    'flex min-w-0 items-center overflow-hidden text-sm leading-5.5 text-muted-foreground text-ellipsis whitespace-nowrap',
  ),
};

/**
 * Highlight underline effect using gradient background
 */
export const highlightTextStyles = createStaticStyles(({ css, cssVar }) => {
  const highlightBase = (highlightColor: string) => css`
    overflow: hidden;

    min-width: 0;
    margin-inline-start: 4px;
    padding-block-end: 1px;

    color: ${cssVar.colorText};
    text-overflow: ellipsis;

    background: linear-gradient(to top, ${highlightColor} 40%, transparent 40%);
  `;

  return {
    gold: highlightBase(cssVar.gold4),
    info: highlightBase(cssVar.colorInfoBg),
    primary: highlightBase(cssVar.colorPrimaryBgHover),
    warning: highlightBase(cssVar.colorWarningBg),
  };
});

/**
 * Shiny loading text animation, toned down to the secondary text color so a
 * shimmering label sits at the same visual weight as the static text next to it.
 */
const shinyToneStyles = createStaticStyles(({ css, cssVar }) => ({
  secondary: css`
    /* The upstream rest color is a 28% mix of --shiny-color, which reads far
     * weaker than the static labels next to it. Pin the rest color to the
     * neighbouring text color and let the sweep peak at full colorText. */
    &&& {
      --shiny-color: ${cssVar.colorText};

      color: ${cssVar.colorTextSecondary};
    }
  `,
}));

const shine = keyframes`
  0% {
    background-position: 100%;
  }

  100% {
    background-position: -100%;
  }
`;
const sweep = keyframes`
  0% {
    translate: -100% 0;
  }

  100% {
    translate: 100% 0;
  }
`;

const localShinyText = createStaticStyles(({ css, cssVar }) => ({
  shiny: css`
    --shiny-duration: 1.5s;
    --shiny-color: ${cssVar.colorText};

    user-select: none;

    color: color-mix(in srgb, var(--shiny-color) 28%, transparent);

    background: linear-gradient(120deg, transparent 25%, var(--shiny-color) 50%, transparent 75%);
    background-clip: text;
    background-size: 200% 100%;

    animation: ${shine} var(--shiny-duration) linear infinite;

    @supports (-webkit-mask-clip: text) {
      &:not(:has(*)) {
        position: var(--shiny-origin, relative);

        background: none;

        animation: none;

        /* stylelint-disable-next-line declaration-property-value-no-unknown */
        mask-clip: text;
        mask-image: linear-gradient(#fff, #fff);

        &::after {
          pointer-events: none;
          will-change: transform;
          content: '';

          position: absolute;
          inset: 0;

          background: linear-gradient(
            90deg,
            transparent 25%,
            var(--shiny-color) 50%,
            transparent 75%
          );

          animation: ${sweep} var(--shiny-duration) linear infinite;
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      animation: none;

      &::after {
        display: none;
      }
    }
  `,
}));

export const shinyTextStyles = {
  // A motion marker must survive Tailwind text-color class merging.
  shinyText: cx('orvilo-shiny', localShinyText.shiny, shinyToneStyles.secondary),
};

export const shinyGroupStyles = {
  shinyGroup: localTextGroupStyles.shinyGroup,
};
