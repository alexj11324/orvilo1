import {
  highlightTextStyles as sharedHighlightTextStyles,
  shinyGroupStyles as sharedShinyGroupStyles,
} from '@orvilo/shared-tool-ui/styles';

import nativeStyles from './textLoading.module.css';

export const oneLineEllipsis = nativeStyles.oneLineEllipsis;

export const inspectorTextStyles = {
  // Keep every child sweep anchored to the inspector row on mask-capable engines.
  root: 'overflow-hidden flex items-center min-w-0 text-muted-foreground text-ellipsis whitespace-nowrap supports-[-webkit-mask-clip:text]:relative supports-[-webkit-mask-clip:text]:[--shiny-origin:static]',
};

export const highlightTextStyles = sharedHighlightTextStyles;

export const shinyGroupStyles = sharedShinyGroupStyles;
