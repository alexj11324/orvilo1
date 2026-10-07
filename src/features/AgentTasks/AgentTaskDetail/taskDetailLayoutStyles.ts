import { createStaticStyles, cssVar } from 'antd-style';

export const TASK_DETAIL_SIDEBAR_MIN_WIDTH = 720;

const SIDEBAR_WIDTH = 232;

// One header, two forms, chosen by the column width rather than the viewport:
// the same sections mount in the full page, the chat-side Portal and beside
// the task-agent panel. One mounted property set wraps beneath the title in
// narrow panes and stays in the right rail when that same container is wide.
const controlFeedback = `
  border-radius: ${cssVar.borderRadius};
  background: transparent;
  transition: background ${cssVar.motionDurationMid};

  &:not(:disabled, [aria-disabled='true'], [data-disabled]) {
    &:hover,
    &:focus-visible,
    &[aria-expanded='true'] {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  }
`;

export const taskDetailLayoutStyles = createStaticStyles(({ css }) => ({
  interactiveControl: css`
    ${controlFeedback}
  `,
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
   * Properties precede the description in DOM order; the wide grid puts them
   * beside the title without mounting a second copy of the controls.
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
   * single-column grid this follows the title, wrapping properties and description.
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
  propertyGroups: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    min-width: 0;

    > div {
      display: contents;
    }

    > [data-wide-only='true'] {
      display: none;
    }

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      flex-flow: column nowrap;
      gap: 24px;
      align-items: stretch;

      > div,
      > [data-wide-only='true'] {
        display: flex;
      }
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
   * Group headings identify the wide rail; narrow panes use a compact strip.
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
    border-radius: 999px;

    white-space: nowrap;

    background: ${cssVar.colorFillTertiary};

    &:not(:disabled, [aria-disabled='true'], [data-disabled]):hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  properties: css`
    display: contents;
    max-width: 100%;

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: stretch;
    }
  `,
  /** One value-only property; field names remain on its accessible trigger. */
  propertyRow: css`
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;

    min-width: 0;
    max-width: 100%;

    &[data-wide-only='true'] {
      display: none;
    }

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      width: 100%;

      &[data-wide-only='true'] {
        display: flex;
      }
    }
  `,
  propertyLabel: css`
    display: flex;
    flex: none;
    gap: 6px;
    align-items: center;

    width: 120px;
    height: 30px;

    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: ${cssVar.colorTextTertiary};
    letter-spacing: 0.13px;
  `,
  propertyMark: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 16px;
    height: 16px;

    color: currentcolor;
  `,
  propertyStateMark: css`
    width: 14px;
    height: 14px;
    border: 1.5px solid currentcolor;
    border-radius: 50%;
  `,
  propertyValue: css`
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;

    min-width: 0;
    max-width: 100%;
    min-height: 30px;

    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: ${cssVar.colorText};
    letter-spacing: 0.13px;

    > :is(
      [data-slot='dropdown-menu-trigger'],
      [data-slot='popover-trigger'],
      [data-slot='button']
    ) {
      ${controlFeedback}
      min-width: 0;
      max-width: 100%;
      padding-block: 4px;
      padding-inline: 8px;
      border-radius: 999px;

      background: ${cssVar.colorFillTertiary};

      &:not(:disabled, [aria-disabled='true'], [data-disabled]):hover {
        background: ${cssVar.colorFillSecondary};
      }
    }

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
      height: 30px;
      background: transparent;
    }
  `,
}));
