import { shinyTextStyles as sharedShinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import { css } from 'antd-style';

export const dotLoading = css`
  &::after {
    content: '\\2026'; /* ascii code for the ellipsis character */

    overflow: hidden;
    display: inline-block;

    width: 0;

    vertical-align: bottom;

    animation: ellipsis steps(4, end) 900ms infinite;
  }

  @keyframes ellipsis {
    to {
      width: 1.25em;
    }
  }

  @keyframes ellipsis {
    to {
      width: 1.25em;
    }
  }
`;

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
