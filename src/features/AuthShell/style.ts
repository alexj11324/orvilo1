import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  footer: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 100%;
    padding-block: 24px 32px;
    padding-inline: clamp(20px, 4vw, 40px);
  `,

  header: css`
    display: flex;
    flex: none;
    gap: 16px;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    padding-block: 20px;
    padding-inline: clamp(20px, 4vw, 40px);
  `,

  headerActions: css`
    flex: none;
  `,

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

  main: css`
    display: flex;
    flex: 1 0 auto;
    align-items: center;
    justify-content: center;

    width: 100%;
    min-width: 0;
    padding-block: 32px 48px;
    padding-inline: 24px;

    @media (width <= 640px) {
      align-items: flex-start;
      padding-block: 24px 40px;
      padding-inline: 20px;
    }
  `,

  page: css`
    overflow: hidden auto;

    box-sizing: border-box;
    min-height: 100dvh;

    color: ${cssVar.colorText};

    background: ${cssVar.colorBgLayout};
  `,
}));
