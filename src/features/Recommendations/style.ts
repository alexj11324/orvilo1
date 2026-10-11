import { createStaticStyles } from 'antd-style';

import { SPIN_TURN_MS } from './spinHold';

const registeredStyles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    &:hover {
      border-color: ${cssVar.colorBorder} !important;
    }
  `,
  compactRow: css`
    justify-content: flex-start;

    width: calc(100% + 16px);
    height: auto;
    min-height: calc(var(--spacing) * 9);
    margin-inline: -8px;
    padding-block: 6px;
    padding-inline: 8px;
    border: 0;
    border-radius: ${cssVar.borderRadius};

    text-align: start;

    transition: background-color ${cssVar.motionDurationMid};

    /* Keep the disabled guard and match the local Button semantic hover wash. */
    &:hover:not(:disabled, [aria-disabled='true']) {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  refreshSpin: css`
    animation: recommendations-refresh-spin ${SPIN_TURN_MS}ms linear infinite;

    @keyframes recommendations-refresh-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Keep the "working" signal, drop the rotation. */
    @media (prefers-reduced-motion: reduce) {
      opacity: 0.45;
      animation: none;
    }
  `,
}));

export const styles = {
  card: registeredStyles.card,
  compactRow: `${registeredStyles.compactRow} motion-reduce:transition-none`,
  compactTitle: 'min-w-0',
  refreshSpin: `${registeredStyles.refreshSpin} motion-reduce:animate-none`,
  subtitle: 'text-foreground-description',
};
