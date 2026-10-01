import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    pointer-events: none;

    position: absolute;
    z-index: 50;
    inset-block-end: 16px;
    inset-inline-end: 16px;
    transform: translateY(16px);

    opacity: 0;
    background: color-mix(in srgb, ${cssVar.colorBgElevated} 50%, transparent) !important;
    backdrop-filter: saturate(150%) blur(10px);
  `,
  visible: css`
    pointer-events: all;
    transform: translateY(0);
    opacity: 1;
  `,
}));
