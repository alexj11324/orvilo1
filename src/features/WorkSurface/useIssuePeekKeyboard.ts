'use client';

import { useEffect, useRef } from 'react';

import { issuePeekKeyFromEvent, reduceIssuePeekKey } from './issuePeekKeyboard';
import {
  findIssueRowElement,
  isIssueElementVisible,
  resolveIssueKeyScope,
} from './issuePeekKeyContext';

export interface UseIssuePeekKeyboardOptions {
  /** Off when the list has no peek (board layout, no project scope...). */
  enabled?: boolean;
  /** Issue identifier of a row key. Default: the key is the identifier. */
  idOf?: (key: string) => string;
  /**
   * Visible row keys in render order. A key is the Issue identifier unless the
   * list can show an Issue twice (several sections): then it is a per-row key
   * and `idOf` maps it back, and rows carry `data-issue-slot`.
   */
  ids: readonly string[];
  /** Full Issue page for the row. Absent: Enter keeps the row's own navigation. */
  onOpenPage?: (id: string) => void;
  /** Open / follow (`id`) or close (`null`) the peek. The host owns arming. */
  onPeek: (id: string | null) => void;
  /** The Issue shown in the peek pane, or `null` when it is closed. */
  peekId: string | null;
  /**
   * Scroll a virtualized list so the row mounts. Called while the row to
   * focus is not in the DOM yet.
   */
  reveal?: (id: string) => void;
  /** Stable owning surface, shared by its list and peek across layout remounts. */
  scopeRoot: HTMLElement | null;
}

const MAX_FOCUS_FRAMES = 40;
const REVEAL_EVERY_FRAMES = 8;

/**
 * Focus restoration outlives the hook instance on purpose: opening or closing
 * the peek can move the list under a different wrapper (My issues swaps its
 * layout), which remounts the list and the hook with it. The newest request
 * wins within its stable surface; that surface's mounted list `reveal` is
 * looked up at call time. Other split panes cannot replace the request.
 */
interface SurfaceFocusState {
  request: number;
  reveal?: (id: string) => void;
}
const surfaceFocus = new WeakMap<HTMLElement, SurfaceFocusState>();

const focusStateFor = (root: HTMLElement): SurfaceFocusState => {
  let state = surfaceFocus.get(root);
  if (!state) {
    state = { request: 0 };
    surfaceFocus.set(root, state);
  }
  return state;
};

const focusIssueRow = (id: string, root: HTMLElement) => {
  const state = focusStateFor(root);
  const request = ++state.request;
  let frame = 0;
  // Start on the next frame: the state change that opened / closed the peek
  // commits first, and the row we would focus now may be about to be replaced.
  const attempt = () => {
    if (request !== state.request || !isIssueElementVisible(root)) return;
    const row = findIssueRowElement(id, root);
    if (row) {
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (frame % REVEAL_EVERY_FRAMES === 0) state.reveal?.(id);
    if (++frame < MAX_FOCUS_FRAMES) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
};

/**
 * Linear's keyboard peek for an Issue list: Space toggles the peek, J/K and
 * the arrow keys move through the visible rows (the open peek follows), Enter
 * opens the full page, Esc closes the peek and puts focus back on its row.
 *
 * One `keydown` listener in the capture phase on `document`, not
 * `react-hotkeys-hook`: a focused row is `role="button"` and activates itself
 * on Space / Enter in a React handler, which would run before a bubbling
 * document listener and navigate away instead of peeking. Capturing first lets
 * us claim the key (`stopPropagation`) only when the shortcut really applies;
 * `resolveIssueKeyScope` yields to typing, open overlays and real controls.
 * Page-local keys, so they are deliberately not in the rebindable registry
 * (same as the Inbox list keys).
 */
export const useIssuePeekKeyboard = (options: UseIssuePeekKeyboardOptions): void => {
  const latest = useRef(options);
  latest.current = options;
  const { enabled = true, scopeRoot } = options;

  useEffect(() => {
    if (!enabled || !scopeRoot) return;

    const reveal = (id: string) => latest.current.reveal?.(id);
    const state = focusStateFor(scopeRoot);
    state.reveal = reveal;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const key = issuePeekKeyFromEvent(event);
      if (!key) return;
      const scope = resolveIssueKeyScope(event.target, scopeRoot);
      if (!scope) return;
      const { idOf, ids, onOpenPage, onPeek, peekId } = latest.current;
      const toId = (rowKey: string) => idOf?.(rowKey) ?? rowKey;
      // The reducer works in row keys. The peeked Issue is the focused row when
      // that row shows it (any section's copy), else its first listed row.
      const peekKey =
        peekId === null
          ? null
          : scope.rowId && toId(scope.rowId) === peekId
            ? scope.rowId
            : (ids.find((rowKey) => toId(rowKey) === peekId) ?? peekId);

      // Space / Enter on a button or link keeps its native meaning; the arrow
      // keys scroll the peek pane, so only J / K drive the list from there.
      if ((key === 'togglePeek' || key === 'openPage') && scope.onControl) return;
      if (
        (key === 'next' || key === 'previous') &&
        !scope.fromList &&
        event.key.startsWith('Arrow')
      ) {
        return;
      }
      if (key === 'openPage' && !onOpenPage) return;
      // A held key must not toggle, open or close repeatedly.
      if (event.repeat && (key === 'togglePeek' || key === 'openPage' || key === 'closePeek')) {
        return;
      }

      const result = reduceIssuePeekKey(
        { currentId: scope.rowId ?? peekKey, ids, peekId: peekKey },
        key,
      );
      if (!result) return;

      event.preventDefault();
      event.stopPropagation();

      if (result.peekId !== undefined) {
        onPeek(result.peekId === null ? null : toId(result.peekId));
      }
      if (result.openPageId) onOpenPage?.(toId(result.openPageId));
      // Focus stays on (or returns to) the list: the peek never takes it, so
      // J / K keep working, and closing hands it back to the peeked row.
      const focusId = result.focusId ?? result.peekId ?? (result.peekId === null ? peekKey : null);
      if (focusId) focusIssueRow(focusId, scopeRoot);
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      if (state.reveal === reveal) state.reveal = undefined;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled, scopeRoot]);
};
