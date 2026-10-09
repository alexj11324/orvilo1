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

/** One slot of the rendered order: a group header or a navigable row. */
export interface IssuePeekOrderEntry {
  /** Header: the collapse key (`data-work-group-header`). Row: the row key. */
  key: string;
  kind: 'header' | 'row';
}

/**
 * J / K from a focused group header: the first visible row after that header
 * (`next`) or the last visible row before it (`previous`). `null` when the
 * header is unknown or there is no such row, so the key is left alone.
 */
export const reduceIssuePeekHeaderKey = (
  {
    headerKey,
    order,
    peekId,
  }: { headerKey: string; order: readonly IssuePeekOrderEntry[]; peekId: string | null },
  key: IssuePeekKey,
): IssuePeekKeyResult | null => {
  if (key !== 'next' && key !== 'previous') return null;
  const at = order.findIndex((entry) => entry.kind === 'header' && entry.key === headerKey);
  if (at < 0) return null;
  const candidates = key === 'next' ? order.slice(at + 1) : order.slice(0, at).reverse();
  const target = candidates.find((entry) => entry.kind === 'row')?.key;
  if (target === undefined) return null;
  return peekId === null ? { focusId: target } : { focusId: target, peekId: target };
};

/**
 * The row key the keyboard is "on" when the peek is open. Navigation state is
 * the ROW key, never the Issue id: an Issue listed in two sections must not
 * snap back to its first copy. Order of trust: the focused row if it shows the
 * peeked Issue, then the row the keyboard last moved to / focus last sat on,
 * then (nothing better known) the first listed copy.
 */
export const resolvePeekRowKey = ({
  focusedKey,
  ids,
  lastKey,
  peekId,
  toId,
}: {
  focusedKey: string | null;
  ids: readonly string[];
  lastKey: string | null;
  peekId: string | null;
  toId: (rowKey: string) => string;
}): string | null => {
  if (peekId === null) return null;
  if (focusedKey && toId(focusedKey) === peekId) return focusedKey;
  if (lastKey && ids.includes(lastKey) && toId(lastKey) === peekId) return lastKey;
  return ids.find((rowKey) => toId(rowKey) === peekId) ?? peekId;
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
