import { createStaticStyles, cssVar } from 'antd-style';

export const TASK_DETAIL_SIDEBAR_MIN_WIDTH = 720;

const SIDEBAR_WIDTH = 232;

// One header, two forms, chosen by the column width rather than the viewport:
// the same sections mount in the full page, the chat-side Portal and beside
// the task-agent panel. The properties list is Plane's label/value rows at
// every width.
export const taskDetailLayoutStyles = createStaticStyles(({ css }) => ({
  root: css`
    container-name: task-detail;
    container-type: inline-size;
  `,
  header: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    row-gap: 16px;
    padding-block: 24px 36px;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      grid-template-columns: minmax(0, 1fr) ${SIDEBAR_WIDTH}px;
      column-gap: 40px;
    }
  `,
  /**
   * Description sits under the title on every width. On a narrow pane the
   * properties rail follows it, so the issue text is not buried under the
   * property stack.
   */
  description: css`
    grid-column: 1;
    min-width: 0;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      grid-row: 2;
    }
  `,
  main: css`
    min-width: 0;
  `,
  /**
   * The prose column — instruction, sub-issues, artifacts, activity. Pinned to
   * the grid's first track so in the wide layout it stays bounded beside the
   * rail instead of running underneath it (the reference keeps two columns for
   * the whole page; the space under the rail stays empty). In the narrow
   * single-column grid this is simply the next block after the rail groups.
   */
  body: css`
    grid-column: 1;
    min-width: 0;
    padding-block-end: 120px;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      grid-row: 3;
    }
  `,
  side: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      grid-column: 2;
      grid-row: 1 / 4;
      padding-block-start: 0;
    }
  `,
  /**
   * The rail's own quick actions — the round copy buttons Linear parks at the
   * top-right of the issue body, above "Properties". Right-aligned so they sit
   * on the column's outer edge in both layouts.
   */
  railActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  `,
  /**
   * One labeled rail group ("Properties", "Project"). The heading stays
   * visible at every width — Plane's properties block always titles itself.
   */
  railSection: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  `,
  railSectionLabel: css`
    display: block;

    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
  /** A stacked row inside a rail section — same hit area as a property cell. */
  railRow: css`
    width: 100%;
    max-width: 100%;
    height: 28px;
    padding-inline: 8px 10px;
    border-radius: ${cssVar.borderRadius};

    white-space: nowrap;
  `,
  properties: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;

    max-width: 100%;
  `,
  /** Plane's property row: 120px tertiary label, then the value control. */
  propertyRow: css`
    display: flex;
    gap: 8px;
    align-items: flex-start;
    min-width: 0;
  `,
  propertyValue: css`
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 4px;

    /* Stretch, not center: the picker triggers are the row's direct children
       and centre their own content, so they fill the 28px row and the whole
       row height is clickable instead of just the content box. */
    align-items: stretch;

    min-width: 0;
    min-height: 28px;

    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: ${cssVar.colorText};
    letter-spacing: 0.13px;

    > * {
      align-items: center;
    }
  `,
  propertyPlaceholder: css`
    color: ${cssVar.colorTextPlaceholder};
  `,
  propertyDanger: css`
    color: ${cssVar.colorError};
  `,
  propertyItem: css`
    max-width: 100%;
    height: 28px;
    padding-inline: 8px 10px;
    border-radius: ${cssVar.borderRadius};

    white-space: nowrap;

    background: ${cssVar.colorFillTertiary};

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      width: 100%;
      background: transparent;
    }
  `,
}));
