import { createStaticStyles } from 'antd-style';

/**
 * Geometry for the routed issue page; split and Portal keep their own width.
 * The main/rail switch lives in one place — the `task-detail` container query
 * in `taskDetailLayoutStyles` — so the page only sets gutters and caps the
 * content width instead of redefining the breakpoint.
 */
export const taskDetailFullPageStyles = createStaticStyles(({ css }) => ({
  document: css`
    width: 100%;
    margin-inline: 0;
    padding-inline: 24px;

    [data-task-detail-header] {
      max-width: 1120px;
      margin-inline: auto;
      padding-block-start: 5px;
    }
  `,
}));
