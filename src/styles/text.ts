import { createStaticStyles, css, cx } from 'antd-style';

/** Coordinate space for the shiny text sweep (was `textGroupStyles.shinyGroup`). */
const shinyGroup = css`
  @supports (-webkit-mask-clip: text) {
    & {
      --shiny-origin: static;

      position: relative;
    }
  }
`;

export const lineEllipsis = (line: number) =>
  cx(css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: ${line};

    text-overflow: ellipsis;
  `);

export const oneLineEllipsis = lineEllipsis(1);

/**
 * Inspector text style for builtin tool inspectors
 * Combines oneLineEllipsis with secondary text color
 */
export const inspectorTextStyles = {
  // Keep every child sweep anchored to the inspector row on mask-capable engines.
  root: 'overflow-hidden flex items-center min-w-0 text-muted-foreground text-ellipsis whitespace-nowrap supports-[-webkit-mask-clip:text]:relative supports-[-webkit-mask-clip:text]:[--shiny-origin:static]',
};

/**
 * Highlight underline effect using gradient background
 * - primary: default blue highlight
 * - info: info blue highlight
 * - warning: warning yellow highlight
 * - gold: gold highlight (for page-agent etc.)
 */
const registeredHighlightTextStyles = createStaticStyles(({ css, cssVar }) => {
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
    primary: highlightBase(cssVar.colorPrimaryBgHover),
  };
});

// Info and warning use document theme roles; primary and gold retain registered producers.
const highlightBase = 'overflow-hidden min-w-0 ms-1 pbe-0.25 text-foreground text-ellipsis';

export const highlightTextStyles = {
  gold: registeredHighlightTextStyles.gold,
  info: `${highlightBase} [background:linear-gradient(to_top,var(--info-wash)_40%,transparent_40%)]`,
  primary: registeredHighlightTextStyles.primary,
  warning: `${highlightBase} [background:linear-gradient(to_top,var(--warning-wash)_40%,transparent_40%)]`,
};

export const shinyGroupStyles = {
  shinyGroup,
};
