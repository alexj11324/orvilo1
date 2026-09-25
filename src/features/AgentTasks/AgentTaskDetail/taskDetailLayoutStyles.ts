import { createStaticStyles, cssVar } from 'antd-style';

export const TASK_DETAIL_SIDEBAR_MIN_WIDTH = 720;

const SIDEBAR_WIDTH = 232;

// One header, two forms, chosen by the column width rather than the viewport:
// the same sections mount in the full page, the chat-side Portal and beside
// the task-agent panel. Wide columns get a Linear-style properties sidebar;
// narrow ones fold the same triggers into a pill row under the title.
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
  `,
  side: css`
    /* Collapsed layout: one wrapping chip row under the title, matching the
       reference — every rail group (properties, project, relations) folds
       into the same flow instead of stacking as labeled sections. Section
       wrappers go display: contents so their rows join this wrap. */
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    min-width: 0;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      grid-column: 2;

      /* Span both rows: the rail is a persistent column, so the prose body in
         row 2 starts directly under the controls instead of waiting for the
         rail's height to end. (1 / -1 can't resolve — the rows are
         implicit; the grid always has exactly two by construction.) */
      grid-row: 1 / 3;
      flex-flow: column nowrap;
      gap: 16px;
      align-items: stretch;

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
   * One labeled rail group ("Properties", "Project", "Related"). In the wide
   * sidebar the label reads as the group heading; in the narrow pill layout it
   * hides, matching Linear, where pill rows carry no section titles.
   */
  railSection: css`
    display: contents;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
  `,
  railSectionLabel: css`
    display: none;

    padding-block: 4px;
    padding-inline: 8px 10px;

    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: block;
    }
  `,
  /**
   * A rail section's heading row — the label plus its trailing "+" add
   * affordance (Linear's hover-plus). The label itself hides in the pill
   * layout (railSectionLabel), but the row stays: the "+" must remain
   * reachable when the sections collapse, otherwise there is no way to add a
   * relation outside the wide sidebar.
   */
  railSectionHeader: css`
    display: contents;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  `,

  railSectionHint: css`
    /* Collapsed: visually hidden rather than display:none — it stays
       announced (role=status) while a bare text line would dangle between
       the pills. */
    position: absolute;

    overflow: hidden;

    width: 1px;
    height: 1px;

    clip-path: inset(50%);

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      position: static;

      overflow: visible;
      display: block;

      width: auto;
      height: auto;
      padding-inline: 8px;

      clip-path: none;
    }
  `,
  /** A stacked row inside a rail section — a full-width line in the wide
     sidebar, an inline chip in the collapsed row (same pill as a property
     cell). */
  railRow: css`
    display: inline-flex;

    width: auto;
    max-width: 100%;
    height: 28px;
    padding-inline: 8px 10px;
    border-radius: ${cssVar.borderRadius};

    white-space: nowrap;

    background: ${cssVar.colorFillTertiary};

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: flex;
      width: 100%;
      height: 30px;
      background: transparent;
    }
  `,
  /** One related-issue row: the clickable issue plus its remove button, an
     inline chip in the collapsed layout. */
  relatedRow: css`
    display: inline-flex;
    align-items: center;

    max-width: 100%;
    height: 28px;
    padding-inline: 4px;
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorFillTertiary};

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: flex;

      width: 100%;
      height: 30px;
      padding-inline: 0;

      background: transparent;
    }
  `,
  properties: css`
    /* Collapsed: contents so the property pills join .side's single wrap
       together with the project and relation chips. */
    display: contents;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: flex;
      flex-direction: column;
      gap: 2px;
      align-items: stretch;
    }
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
      height: 30px;
      background: transparent;
    }
  `,
}));
