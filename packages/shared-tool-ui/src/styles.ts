import { clsx as cx } from 'cn';

import nativeStyles from './styles.module.css';

/**
 * Inspector text style — ellipsis + secondary color + flex align
 */
export const inspectorTextStyles = {
  // Keep the shared sweep coordinate group and its feature-query behavior.
  root: cx(
    nativeStyles.shinyGroup,
    'flex min-w-0 items-center overflow-hidden text-sm leading-5.5 text-muted-foreground text-ellipsis whitespace-nowrap',
  ),
};

/**
 * Highlight underline effect using gradient background
 */
export const highlightTextStyles = {
  gold: `${nativeStyles.highlight} ${nativeStyles.gold}`,
  info: `${nativeStyles.highlight} ${nativeStyles.info}`,
  primary: `${nativeStyles.highlight} ${nativeStyles.primary}`,
  warning: `${nativeStyles.highlight} ${nativeStyles.warning}`,
};

/**
 * Shiny loading text animation, toned down to the secondary text color so a
 * shimmering label sits at the same visual weight as the static text next to it.
 */
export const shinyTextStyles = {
  // A motion marker must survive Tailwind text-color class merging.
  shinyText: cx(
    'orvilo-shiny',
    nativeStyles.shiny,
    nativeStyles.secondaryTone,
    // Chromium requires this public WebKit property for glyph masking. Keep the
    // same feature query and child-content guard as the native module branch.
    'supports-[-webkit-mask-clip:text]:[&:not(:has(*))]:[-webkit-mask-clip:text]',
  ),
};

export const shinyGroupStyles = {
  shinyGroup: nativeStyles.shinyGroup,
};
