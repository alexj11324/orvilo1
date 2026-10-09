import { createStaticStyles, cssVar } from 'antd-style';

export const TASK_DETAIL_SIDEBAR_MIN_WIDTH = 720;

const SIDEBAR_WIDTH = 232;

// One header, two forms, chosen by the column width rather than the viewport:
// the same sections mount in the full page, the chat-side Portal and beside
// the task-agent panel. One mounted property set wraps beneath the title in
// narrow panes and stays in the right rail when that same container is wide.
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
   * The properties follow the title in DOM order, so on a narrow pane they
   * stay above the issue text; the wide grid moves them into the right rail
   * without mounting a second copy of the controls.
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
      position: sticky;
      inset-block-start: 16px;

      grid-column: 2;
      grid-row: 1 / 4;
      align-self: start;

      padding-block-start: 0;
    }
  `,
  /**
   * Narrow: every property is a pill in one wrapping strip (the groups and
   * their list wrappers dissolve into it). Wide: the labeled rail column.
   */
  propertyGroups: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    min-width: 0;

    > div {
      display: contents;
    }

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      flex-flow: column nowrap;
      gap: 24px;
      align-items: stretch;

      > div {
        display: flex;
      }
    }
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
    display: none;

    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: ${cssVar.colorText};

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: block;
    }
  `,
  /** A stacked row inside a rail section — same hit area as a property cell. */
  railRow: css`
    width: fit-content;
    max-width: 100%;
    height: 28px;
    padding-inline: 8px 10px;
    border-radius: ${cssVar.borderRadius};

    white-space: nowrap;

    background: ${cssVar.colorFillTertiary};

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      width: 100%;

      /* Same left edge as the value-only property rows above. */
      padding-inline: 0;
      background: transparent;
    }
  `,
  properties: css`
    display: contents;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: stretch;

      max-width: 100%;
    }
  `,
  /** One value-only property. */
  propertyRow: css`
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;

    min-width: 0;
    max-width: 100%;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      width: 100%;
    }
  `,
  propertyValue: css`
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;

    min-width: 0;
    max-width: 100%;
    min-height: 28px;

    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: ${cssVar.colorText};
    letter-spacing: 0.13px;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      flex: 1;
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
