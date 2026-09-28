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

    [data-task-detail-header] textarea.ant-input {
      font-size: 24px;
      line-height: 1.6;
    }

    /* Keep a readable main column until the rail fits beside it. */
    @container work-surface (width < 1136px) {
      [data-task-detail-header] {
        grid-template-columns: minmax(0, 1fr);
      }

      [data-task-detail-side] {
        grid-column: auto;
        grid-row: auto;
      }
    }

    @container work-surface (width >= 1136px) {
      padding-inline: 5.75% 17.4%;

      [data-task-detail-header] {
        column-gap: 5.6%;
      }
    }
  `,
}));
