import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  logoLink: css`
    display: inline-flex;
    flex: none;
    align-items: center;

    min-width: 0;

    color: ${cssVar.colorText};
    text-decoration: none;

    &:focus-visible {
      border-radius: ${cssVar.borderRadiusSM};
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 4px;
    }
  `,
}));
