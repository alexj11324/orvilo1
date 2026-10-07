import { createStaticStyles } from 'antd-style';

/** Geometry for the routed issue page; split and Portal keep their own width. */
export const taskDetailFullPageStyles = createStaticStyles(({ css }) => ({
  document: css`
    width: 100%;
    margin-inline: 0;
    padding-inline: 14px 24px;

    [data-task-detail-header] {
      padding-block-start: 5px;
    }

    /* Column placement follows the issue's own container, including split panes. */
    @container work-surface (width >= 1136px) {
      padding-inline: 5.75% 17.4%;

      [data-task-detail-header] {
        column-gap: 5.6%;
      }
    }
  `,
}));
