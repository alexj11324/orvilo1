import { createStaticStyles, keyframes } from 'antd-style';

const retainedStyles = createStaticStyles(({ css, cssVar }) => {
  const locateHighlight = keyframes`
    0%, 100% {
      background: transparent;
    }

    15%, 55% {
      background: ${cssVar.colorPrimaryBg};
    }
  `;

  return {
    container: css`
      position: relative;

      &[data-message-locate-highlight] {
        border-radius: var(--radius-card);
        animation: ${locateHighlight} 1400ms ${cssVar.motionEaseOut};
      }

      time {
        pointer-events: none;

        display: inline-block;

        white-space: nowrap;

        opacity: 0;

        transition: opacity var(--orvilo-motion-mid) ${cssVar.motionEaseOut};
      }

      &:hover,
      &:focus-within {
        time {
          pointer-events: unset;
          opacity: 1;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        &[data-message-locate-highlight] {
          background: ${cssVar.colorPrimaryBg};
          animation: none;
        }
      }
    `,
  };
});

export const styles = {
  container: retainedStyles.container,
  loading:
    'absolute inset-be-0 -start-1 [inset-inline-end:unset] size-4 rounded-full text-background bg-primary',
};
