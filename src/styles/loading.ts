import { shinyTextStyles as sharedShinyTextStyles } from '@orvilo/shared-tool-ui/styles';

import nativeStyles from './textLoading.module.css';

// This class is a motion-gate hook, not a second Tailwind animation producer.
export const dotLoading = `animate-orvilo-dot-loading ${nativeStyles.dotLoading}`;

export const elapsedTimeStyles = {
  elapsedTime: 'text-foreground-tertiary',
};

export const errorTextStyles = {
  errorText: 'text-destructive-text',
};

export const shinyTextStyles = {
  errorText: errorTextStyles.errorText,
  shinyText: sharedShinyTextStyles.shinyText,
};
