import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    position: absolute;
    z-index: 50;
    inset-block-end: 16px;
    inset-inline-end: 16px;

    background: color-mix(in srgb, ${cssVar.colorBgElevated} 50%, transparent) !important;
    backdrop-filter: saturate(150%) blur(10px);
  `,
}));
