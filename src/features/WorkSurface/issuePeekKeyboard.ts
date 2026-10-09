/**
 * Linear-style keyboard peek for Issue lists — the pure state machine.
 *
 * Every host (My issues, team issues, project issues) feeds the same inputs:
 * the visible Issue ids in render order, the id the key applies to, the id
 * currently peeked, and a key. The result says what to focus / peek / open.
 * Nothing here touches the DOM, so the rules are unit-testable on their own.
 */

export type IssuePeekKey = 'closePeek' | 'next' | 'openPage' | 'previous' | 'togglePeek';

export interface IssuePeekKeyState {
  /** The row the key applies to: the focused row, else the peeked one. */
  currentId: string | null;
  /** Visible ids in render order — grouping, filters and collapsed groups applied. */
  ids: readonly string[];
  /** The Issue shown in the peek pane, or `null` when it is closed. */
  peekId: string | null;
}

export interface IssuePeekKeyResult {
  /** Row to move keyboard focus to. */
  focusId?: string;
  /** Full Issue page to open. */
  openPageId?: string;
  /** New peek target: an id opens / follows, `null` closes, `undefined` leaves it. */
  peekId?: string | null;
}

/**
 * Next state for one key, or `null` when the key is not ours to handle (the
 * caller must then leave the event alone so native behaviour survives).
 *
 * - `next` / `previous` clamp at the ends (Linear does not wrap) and the open
 *   peek follows the selection. With no current row, `next` starts at the
 *   first and `previous` at the last.
 * - A current id that is no longer listed (a filter just removed it) is a
 *   no-op rather than a jump to an arbitrary row.
 * - `togglePeek` closes when the current row is already peeked, else opens it.
 * - `closePeek` only applies while a peek is open, so Esc is never swallowed.
 */
export const reduceIssuePeekKey = (
  { currentId, ids, peekId }: IssuePeekKeyState,
  key: IssuePeekKey,
): IssuePeekKeyResult | null => {
  if (key === 'closePeek') return peekId === null ? null : { peekId: null };
  if (ids.length === 0) return null;

  if (key === 'next' || key === 'previous') {
    let target: string;
    if (currentId === null) {
      target = key === 'next' ? ids[0]! : ids.at(-1)!;
    } else {
      const index = ids.indexOf(currentId);
      if (index < 0) return null;
      const step = key === 'next' ? 1 : -1;
      target = ids[Math.min(ids.length - 1, Math.max(0, index + step))]!;
    }
    return peekId === null ? { focusId: target } : { focusId: target, peekId: target };
  }

  if (currentId === null || !ids.includes(currentId)) return null;
  if (key === 'togglePeek') {
    return { peekId: peekId === currentId ? null : currentId };
  }
  return { openPageId: currentId };
};

interface KeyEventLike {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Key → action. Modified keys (Cmd/Ctrl/Alt/Shift + key) are never ours. */
export const issuePeekKeyFromEvent = (event: KeyEventLike): IssuePeekKey | null => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  switch (event.key) {
    case 'j':
    case 'J':
    case 'ArrowDown': {
      return 'next';
    }
    case 'k':
    case 'K':
    case 'ArrowUp': {
      return 'previous';
    }
    case ' ': {
      return 'togglePeek';
    }
    case 'Enter': {
      return 'openPage';
    }
    case 'Escape': {
      return 'closePeek';
    }
    default: {
      return null;
    }
  }
};
