'use client';

import { Flexbox, type FlexboxProps } from '@lobehub/ui';
import { ActionIcon, Popover } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { SlidersHorizontalIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { memo } from 'react';

import {
  WORK_SURFACE_CONTAINER,
  WORK_SURFACE_DOCUMENT_MAX_WIDTH,
  WORK_SURFACE_GUTTER_X,
  WORK_SURFACE_GUTTER_Y,
  WORK_SURFACE_SPLIT_LIST_WIDTH,
} from './tokens';

/**
 * Work-surface layout skeletons (v6 parity contract).
 *
 * Why this exists: `WideScreenContainer` is the *chat* column — a centered,
 * toggleable `min(960px, 100%)` reading lane built for conversation. Business
 * surfaces that reused it inherited chat semantics: a letterboxed column and a
 * chat preference resizing their rows. These frames give work surfaces their
 * own geometry instead:
 *
 * - `WorkSurface` — root container. Owns `container-type: inline-size` (named
 *   `work-surface`) so children respond to the surface width — already minus
 *   the sidebar and open sidepanes — never to the window or the chat toggle.
 * - `Collection` — scroll host + full-width body at the fixed gutter.
 *   `toolbar` stays pinned above the scroll; `columnHeader` is sticky inside
 *   it. Rows and the column header share the same left edge.
 * - `Document` — scroll host + centered content column capped at
 *   `WORK_SURFACE_DOCUMENT_MAX_WIDTH`, fixed for every viewport and toggle
 *   state.
 * - `Split` — list pane + detail pane. Each pane is the single scroll owner
 *   for its content; a missing `detail` renders nothing, so the list pane
 *   recomputes to full width instead of leaving a dead column.
 * - `Review` — shared frame for the PR review surface: pinned file nav,
 *   scrolling diff column, pinned submit footer. The internal structure of
 *   each region belongs to the review surface owner.
 * - `Toolbar` — a single non-wrapping row. `aside` controls render inline
 *   while they fit and collapse into a popover below the collapse width, so
 *   the toolbar degrades to an overflow menu rather than a third row or a
 *   clipped control.
 */

const styles = createStaticStyles(({ css }) => ({
  collectionBody: css`
    width: 100%;
    padding-block: ${WORK_SURFACE_GUTTER_Y}px;
    padding-inline: ${WORK_SURFACE_GUTTER_X}px;
  `,
  columnHeader: css`
    position: sticky;
    z-index: 1;
    inset-block-start: 0;
    background: ${cssVar.colorBgLayout};
  `,
  documentBody: css`
    width: min(${WORK_SURFACE_DOCUMENT_MAX_WIDTH}px, 100%);
    margin-inline: auto;
    padding-block: ${WORK_SURFACE_GUTTER_Y}px;
    padding-inline: ${WORK_SURFACE_GUTTER_X}px;
  `,
  reviewFooter: css`
    flex: none;
    padding-block: 8px;
    padding-inline: ${WORK_SURFACE_GUTTER_X}px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  reviewNav: css`
    overflow-y: auto;
    flex: none;
    width: 280px;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  root: css`
    container-name: ${WORK_SURFACE_CONTAINER};
    container-type: inline-size;
    display: flex;
    flex: 1;
    flex-direction: column;

    height: 100%;
    min-height: 0;
  `,
  scrollHost: css`
    overflow-y: auto;
    overscroll-behavior: contain;
    flex: 1;
    min-height: 0;
  `,
  split: css`
    display: flex;
    flex: 1;
    min-height: 0;
  `,
  splitDetail: css`
    overflow-y: auto;
    flex: 1;
    min-width: 0;
  `,
  splitList: css`
    overflow-y: auto;
    flex: none;

    width: ${WORK_SURFACE_SPLIT_LIST_WIDTH}px;
    max-width: 45%;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  splitListSolo: css`
    overflow-y: auto;
    flex: 1;
    min-width: 0;
  `,
  toolbar: css`
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;

    min-width: 0;
    padding-block: 8px;
    padding-inline: ${WORK_SURFACE_GUTTER_X}px;
  `,
  toolbarAside: css`
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;

    margin-inline-start: auto;

    /* literals: stylelint cannot resolve template interpolations in @container preludes */
    @container work-surface (max-width: 560px) {
      display: none;
    }
  `,
  toolbarOverflowTrigger: css`
    display: none;
    flex: none;
    margin-inline-start: auto;

    @container work-surface (max-width: 560px) {
      display: inline-flex;
    }
  `,
  toolbarPrimary: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;
  `,
}));

/* ---------------------------------- Root ---------------------------------- */

const WorkSurface = memo<FlexboxProps>(({ children, className, ...rest }) => (
  <Flexbox className={cx(styles.root, className)} {...rest}>
    {children}
  </Flexbox>
));

WorkSurface.displayName = 'WorkSurface';

/* ------------------------------- Collection ------------------------------- */

export interface WorkSurfaceCollectionProps {
  children?: ReactNode;
  className?: string;
  /** Sticky row above the rows (e.g. a table header) — shares the rows' left edge. */
  columnHeader?: ReactNode;
  style?: CSSProperties;
  /** Pinned above the scroll host; a `WorkSurfaceToolbar` keeps it one row. */
  toolbar?: ReactNode;
}

const WorkSurfaceCollection = memo<WorkSurfaceCollectionProps>(
  ({ children, className, columnHeader, style, toolbar }) => (
    <Flexbox flex={1} style={{ minHeight: 0 }}>
      {toolbar}
      <div className={styles.scrollHost}>
        <div className={cx(styles.collectionBody, className)} style={style}>
          {columnHeader ? <div className={styles.columnHeader}>{columnHeader}</div> : null}
          {children}
        </div>
      </div>
    </Flexbox>
  ),
);

WorkSurfaceCollection.displayName = 'WorkSurfaceCollection';

/* -------------------------------- Document -------------------------------- */

export interface WorkSurfaceDocumentProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const WorkSurfaceDocument = memo<WorkSurfaceDocumentProps>(({ children, className, style }) => (
  <div className={styles.scrollHost}>
    <div className={cx(styles.documentBody, className)} style={style}>
      {children}
    </div>
  </div>
));

WorkSurfaceDocument.displayName = 'WorkSurfaceDocument';

/* --------------------------------- Split ---------------------------------- */

export interface WorkSurfaceSplitProps {
  /**
   * Detail pane content (e.g. `IssueContent`). Rendered only when provided —
   * an absent pane frees its width instead of leaving a dead column.
   */
  detail?: ReactNode;
  detailLabel?: string;
  /** List pane content — the pane owns its own vertical scroll. */
  list: ReactNode;
  listLabel?: string;
  listWidth?: number;
}

const WorkSurfaceSplit = memo<WorkSurfaceSplitProps>(
  ({ detail, detailLabel, list, listLabel, listWidth }) => (
    <div className={styles.split}>
      <div
        aria-label={listLabel}
        className={detail ? styles.splitList : styles.splitListSolo}
        style={detail && listWidth ? { width: listWidth } : undefined}
      >
        {list}
      </div>
      {detail ? (
        <div aria-label={detailLabel} className={styles.splitDetail}>
          {detail}
        </div>
      ) : null}
    </div>
  ),
);

WorkSurfaceSplit.displayName = 'WorkSurfaceSplit';

/* --------------------------------- Review --------------------------------- */

export interface WorkSurfaceReviewProps {
  children?: ReactNode;
  /** Pinned submit region below the scrolling diff column. */
  footer?: ReactNode;
  /** File navigation pane — pinned left, owns its own scroll. */
  nav?: ReactNode;
  navLabel?: string;
  navWidth?: number;
}

const WorkSurfaceReview = memo<WorkSurfaceReviewProps>(
  ({ children, footer, nav, navLabel, navWidth }) => (
    <Flexbox flex={1} style={{ minHeight: 0 }}>
      <Flexbox horizontal flex={1} style={{ minHeight: 0 }}>
        {nav ? (
          <div
            aria-label={navLabel}
            className={styles.reviewNav}
            style={navWidth ? { width: navWidth } : undefined}
          >
            {nav}
          </div>
        ) : null}
        <div className={styles.scrollHost}>{children}</div>
      </Flexbox>
      {footer ? <div className={styles.reviewFooter}>{footer}</div> : null}
    </Flexbox>
  ),
);

WorkSurfaceReview.displayName = 'WorkSurfaceReview';

/* --------------------------------- Toolbar -------------------------------- */

export interface WorkSurfaceToolbarProps {
  /** Secondary / display controls — inline while they fit, popover below the collapse width. */
  aside?: ReactNode;
  /** Overflow trigger a11y name + tooltip; required when `aside` is set. */
  asideLabel?: string;
  /** Primary controls (search, filters, tabs). Never wrap; they shrink. */
  children?: ReactNode;
  className?: string;
}

const WorkSurfaceToolbar = memo<WorkSurfaceToolbarProps>(
  ({ aside, asideLabel, children, className }) => (
    <div className={cx(styles.toolbar, className)}>
      <div className={styles.toolbarPrimary}>{children}</div>
      {aside ? (
        <>
          <div className={styles.toolbarAside}>{aside}</div>
          <Popover
            placement="bottomRight"
            styles={{ content: { padding: 0 } }}
            trigger="click"
            content={
              <Flexbox gap={8} padding={8}>
                {aside}
              </Flexbox>
            }
          >
            <ActionIcon
              aria-label={asideLabel}
              className={styles.toolbarOverflowTrigger}
              icon={SlidersHorizontalIcon}
              title={asideLabel}
            />
          </Popover>
        </>
      ) : null}
    </div>
  ),
);

WorkSurfaceToolbar.displayName = 'WorkSurfaceToolbar';

export default WorkSurface;
export {
  WorkSurfaceCollection,
  WorkSurfaceDocument,
  WorkSurfaceReview,
  WorkSurfaceSplit,
  WorkSurfaceToolbar,
};
