'use client';

import { clsx as cx, cn } from 'cn';
import { SlidersHorizontalIcon } from 'lucide-react';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import geometry from './WorkSurface.module.css';

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

const styles = {
  collectionBody: cx(
    geometry.geometry,
    'w-full px-(--work-surface-gutter-x) py-(--work-surface-gutter-y)',
  ),
  columnHeader: 'sticky inset-bs-0 z-1 bg-background',
  documentBody: cx(
    geometry.geometry,
    'mx-auto w-full max-w-(--work-surface-document-max-width) px-(--work-surface-gutter-x) py-(--work-surface-gutter-y)',
  ),
  reviewFooter: cx(
    geometry.geometry,
    'flex-none border-bs border-divider px-(--work-surface-gutter-x) py-2',
  ),
  reviewNav: 'w-70 flex-none overflow-y-auto border-e border-divider',
  root: '@container/work-surface flex h-full min-h-0 min-w-0 flex-1 flex-col',
  scrollHost: 'min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]',
  split: 'flex min-h-0 min-w-0 flex-1',
  splitDetail: 'min-w-0 flex-1 overflow-y-auto',
  splitList: 'w-90 max-w-9/20 flex-none overflow-y-auto border-e border-divider',
  splitListSolo: 'min-w-0 flex-1 overflow-y-auto',
  toolbar: cx(
    geometry.geometry,
    'flex min-w-0 flex-none items-center gap-2 px-(--work-surface-gutter-x) py-2',
  ),
  toolbarAside:
    'ms-auto flex flex-none items-center gap-2 [@container_work-surface_(width<=560px)]:hidden',
  toolbarOverflowTrigger:
    'ms-auto hidden flex-none [@container_work-surface_(width<=560px)]:inline-flex',
  toolbarPrimary:
    'flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-contain [scrollbar-width:none]',
};

/* ---------------------------------- Root ---------------------------------- */

const WorkSurface = memo<ComponentProps<'div'>>(({ children, className, ...rest }) => (
  <div className={cx(styles.root, className)} data-work-surface="" {...rest}>
    {children}
  </div>
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {toolbar}
      <div className={styles.scrollHost}>
        <div className={cn(styles.collectionBody, className)} style={style}>
          {columnHeader ? <div className={styles.columnHeader}>{columnHeader}</div> : null}
          {children}
        </div>
      </div>
    </div>
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
    <div className={cn(styles.documentBody, className)} style={style}>
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
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
      </div>
      {footer ? <div className={styles.reviewFooter}>{footer}</div> : null}
    </div>
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
    <div className={cn(styles.toolbar, className)}>
      <div className={styles.toolbarPrimary}>{children}</div>
      {aside ? (
        <>
          <div className={styles.toolbarAside}>{aside}</div>
          <Popover>
            <PopoverTrigger
              render={
                <ActionIcon
                  aria-label={asideLabel}
                  className={styles.toolbarOverflowTrigger}
                  icon={SlidersHorizontalIcon}
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                />
              }
            />
            <PopoverContent align={'end'} className="w-auto p-0">
              <div className="flex flex-col gap-2 p-2">{aside}</div>
            </PopoverContent>
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
