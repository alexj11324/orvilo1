'use client';

import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

/**
 * Peek-mode row triggers — the shared "single click selects into the detail
 * pane, double click escapes to the full page" contract Linear applies on
 * every issue list.
 *
 * `WorkQueryResults` (My issues / saved views / team issues / reviews
 * in-product) carries this internally through its `peekOnSelect` +
 * `onSelectTask` + `onOpenTask` props. Lists that own their rows
 * (`TaskList`, `TaskBoardCard`, triage rows) wire the same contract through
 * `peekRowTriggerProps` instead of re-deriving the interactive-descendant
 * guard per surface.
 */

/**
 * Descendants that own their click (status/priority menus, assignee popovers,
 * action icons, links). Peek intercepts row clicks in the capture phase, so
 * it must let these through — base-ui Menu/Popover triggers expose
 * `aria-haspopup`, and `data-popup-open` marks the open ones. Clickable
 * chrome with no interactive element (subtask chips, sync status, the bulk
 * checkbox) carries `data-row-interactive`.
 */
export const ROW_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="tab"]',
  '[aria-haspopup]',
  '[data-popup-open]',
  '[data-row-interactive]',
].join(', ');

export const isInteractiveRowClick = (target: unknown): boolean =>
  typeof Element !== 'undefined' &&
  target instanceof Element &&
  Boolean(target.closest(ROW_INTERACTIVE_SELECTOR));

export interface PeekRowTriggerOptions<T> {
  /**
   * Arms both triggers. Off (or a missing `onSelect`/`onOpen`) leaves the
   * row's built-in click alone — the same gate `WorkQueryResults.peekOnSelect`
   * applies to its rows.
   */
  enabled?: boolean;
  /** Double-click → full-page escape. */
  onOpen?: (item: T) => void;
  /** Plain row click selects the item for the peek pane. */
  onSelect?: (item: T) => void;
}

export interface PeekRowTriggerProps {
  /**
   * Capture phase is the only point before a row's own click fires —
   * interactive children are detected and left alone, everything else is
   * claimed as a peek select (default prevented, propagation stopped).
   */
  onClickCapture?: (event: ReactMouseEvent) => void;
  /** The full-page escape — skipped on interactive chrome too. */
  onDoubleClick?: (event: ReactMouseEvent) => void;
}

/**
 * Row props implementing the peek contract for a non-`WorkQueryResults` list:
 *
 * ```tsx
 * <Flexbox {...peekRowTriggerProps(task, { enabled, onOpen, onSelect })} />
 * ```
 *
 * Spread on the row wrapper. Disabled triggers come back `undefined` so the
 * row renders exactly as it did before — no dead handlers to audit.
 */
export const peekRowTriggerProps = <T>(
  item: T,
  { enabled = true, onOpen, onSelect }: PeekRowTriggerOptions<T>,
): PeekRowTriggerProps => ({
  onClickCapture:
    enabled && onSelect
      ? (event) => {
          if (isInteractiveRowClick(event.target)) return;
          event.preventDefault();
          event.stopPropagation();
          onSelect(item);
        }
      : undefined,
  onDoubleClick:
    enabled && onOpen
      ? (event) => {
          if (isInteractiveRowClick(event.target)) return;
          onOpen(item);
        }
      : undefined,
});

/**
 * Peek selection state for a page: the selected item plus the invariant that
 * it never outlives the list it came from. `resetKey` should carry the
 * list's identity (tab / layout / grouping / query hash) — a key change
 * drops the selection, the same reset contract My issues applies.
 */
export const usePeekSelection = <T>(
  resetKey: string,
): readonly [T | null, Dispatch<SetStateAction<T | null>>] => {
  const [selected, setSelected] = useState<T | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [resetKey]);
  return [selected, setSelected] as const;
};
