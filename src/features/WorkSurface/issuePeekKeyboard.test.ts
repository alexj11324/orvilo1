import { afterEach, describe, expect, it } from 'vitest';

import {
  issuePeekKeyFromEvent,
  type IssuePeekOrderEntry,
  reduceIssuePeekHeaderKey,
  reduceIssuePeekKey,
  resolvePeekRowKey,
} from './issuePeekKeyboard';
import { requestIssueGroupHeaderFocus, restoreIssueGroupHeaderFocus } from './issuePeekKeyContext';

const ids = ['T-1', 'T-2', 'T-3'];

// Same Issue (APX-3) listed in two sections: two row keys, one identifier.
const dupIds = ['blocking:APX-3', 'started:PMI-5', 'started:APX-3', 'started:APX-4'];
const dupToId = (key: string) => key.split(':')[1]!;

describe('resolvePeekRowKey (an Issue shown in two sections)', () => {
  it('keeps the second copy when focus was lost and the keyboard last sat on it', () => {
    // Before: the peeked Issue id mapped back to its FIRST row, so J from the
    // second copy went to PMI-5 / skipped it.
    expect(
      resolvePeekRowKey({
        focusedKey: null,
        ids: dupIds,
        lastKey: 'started:APX-3',
        peekId: 'APX-3',
        toId: dupToId,
      }),
    ).toBe('started:APX-3');
  });

  it('prefers the focused row, then the last row, then the first listed copy', () => {
    const base = { ids: dupIds, peekId: 'APX-3', toId: dupToId };
    expect(
      resolvePeekRowKey({ ...base, focusedKey: 'started:APX-3', lastKey: 'blocking:APX-3' }),
    ).toBe('started:APX-3');
    expect(resolvePeekRowKey({ ...base, focusedKey: null, lastKey: 'started:APX-4' })).toBe(
      'blocking:APX-3',
    );
    expect(resolvePeekRowKey({ ...base, focusedKey: null, lastKey: null })).toBe('blocking:APX-3');
  });

  it('is null with no peek', () => {
    expect(
      resolvePeekRowKey({
        focusedKey: 'x:A-1',
        ids: ['x:A-1'],
        lastKey: null,
        peekId: null,
        toId: dupToId,
      }),
    ).toBeNull();
  });

  it('walks both copies with J when the current key is the row key', () => {
    const key = (current: string) =>
      reduceIssuePeekKey({ currentId: current, ids: dupIds, peekId: 'APX-3' }, 'next');
    expect(key('blocking:APX-3')).toEqual({ focusId: 'started:PMI-5', peekId: 'started:PMI-5' });
    expect(key('started:PMI-5')).toEqual({ focusId: 'started:APX-3', peekId: 'started:APX-3' });
    expect(key('started:APX-3')).toEqual({ focusId: 'started:APX-4', peekId: 'started:APX-4' });
  });
});

describe('reduceIssuePeekHeaderKey (J / K from a focused group header)', () => {
  const order: IssuePeekOrderEntry[] = [
    { key: 'g1', kind: 'header' },
    { key: 'g1:A-1', kind: 'row' },
    { key: 'g1:A-2', kind: 'row' },
    { key: 'g2', kind: 'header' },
    { key: 'g3', kind: 'header' },
    { key: 'g3:B-1', kind: 'row' },
  ];

  it('J goes to the first row after the header, K to the last row before it', () => {
    expect(reduceIssuePeekHeaderKey({ headerKey: 'g1', order, peekId: null }, 'next')).toEqual({
      focusId: 'g1:A-1',
    });
    expect(reduceIssuePeekHeaderKey({ headerKey: 'g3', order, peekId: null }, 'previous')).toEqual({
      focusId: 'g1:A-2',
    });
  });

  it('skips headers of collapsed groups on the way', () => {
    expect(reduceIssuePeekHeaderKey({ headerKey: 'g2', order, peekId: null }, 'next')).toEqual({
      focusId: 'g3:B-1',
    });
  });

  it('lets an open peek follow', () => {
    expect(reduceIssuePeekHeaderKey({ headerKey: 'g1', order, peekId: 'A-9' }, 'next')).toEqual({
      focusId: 'g1:A-1',
      peekId: 'g1:A-1',
    });
  });

  it('does nothing without a row in that direction, for an unknown header, or other keys', () => {
    expect(
      reduceIssuePeekHeaderKey({ headerKey: 'g1', order, peekId: null }, 'previous'),
    ).toBeNull();
    expect(
      reduceIssuePeekHeaderKey({ headerKey: 'g3', order: order.slice(0, 5), peekId: null }, 'next'),
    ).toBeNull();
    expect(reduceIssuePeekHeaderKey({ headerKey: 'nope', order, peekId: null }, 'next')).toBeNull();
    expect(
      reduceIssuePeekHeaderKey({ headerKey: 'g1', order, peekId: null }, 'togglePeek'),
    ).toBeNull();
  });
});

describe('reduceIssuePeekKey', () => {
  it('moves to the next / previous visible Issue', () => {
    expect(reduceIssuePeekKey({ currentId: 'T-1', ids, peekId: null }, 'next')).toEqual({
      focusId: 'T-2',
    });
    expect(reduceIssuePeekKey({ currentId: 'T-3', ids, peekId: null }, 'previous')).toEqual({
      focusId: 'T-2',
    });
  });

  it('clamps at the ends instead of wrapping', () => {
    expect(reduceIssuePeekKey({ currentId: 'T-3', ids, peekId: null }, 'next')).toEqual({
      focusId: 'T-3',
    });
    expect(reduceIssuePeekKey({ currentId: 'T-1', ids, peekId: null }, 'previous')).toEqual({
      focusId: 'T-1',
    });
  });

  it('starts at the first / last row when nothing is current', () => {
    expect(reduceIssuePeekKey({ currentId: null, ids, peekId: null }, 'next')).toEqual({
      focusId: 'T-1',
    });
    expect(reduceIssuePeekKey({ currentId: null, ids, peekId: null }, 'previous')).toEqual({
      focusId: 'T-3',
    });
  });

  it('makes an open peek follow the selection, including a clamped end', () => {
    expect(reduceIssuePeekKey({ currentId: 'T-1', ids, peekId: 'T-1' }, 'next')).toEqual({
      focusId: 'T-2',
      peekId: 'T-2',
    });
    expect(reduceIssuePeekKey({ currentId: 'T-3', ids, peekId: 'T-3' }, 'next')).toEqual({
      focusId: 'T-3',
      peekId: 'T-3',
    });
  });

  it('toggles the peek on the current row', () => {
    expect(reduceIssuePeekKey({ currentId: 'T-2', ids, peekId: null }, 'togglePeek')).toEqual({
      peekId: 'T-2',
    });
    expect(reduceIssuePeekKey({ currentId: 'T-2', ids, peekId: 'T-2' }, 'togglePeek')).toEqual({
      peekId: null,
    });
    // Peek is on another row: Space re-targets it rather than closing.
    expect(reduceIssuePeekKey({ currentId: 'T-3', ids, peekId: 'T-2' }, 'togglePeek')).toEqual({
      peekId: 'T-3',
    });
  });

  it('opens the full page for the current row', () => {
    expect(reduceIssuePeekKey({ currentId: 'T-2', ids, peekId: null }, 'openPage')).toEqual({
      openPageId: 'T-2',
    });
  });

  it('closes only an open peek, so Esc is never swallowed', () => {
    expect(reduceIssuePeekKey({ currentId: 'T-2', ids, peekId: 'T-2' }, 'closePeek')).toEqual({
      peekId: null,
    });
    expect(reduceIssuePeekKey({ currentId: 'T-2', ids, peekId: null }, 'closePeek')).toBeNull();
  });

  it('ignores an empty list', () => {
    for (const key of ['next', 'previous', 'togglePeek', 'openPage'] as const) {
      expect(reduceIssuePeekKey({ currentId: null, ids: [], peekId: null }, key)).toBeNull();
    }
  });

  it('is a no-op when the current Issue disappeared (a filter removed it)', () => {
    const state = { currentId: 'T-9', ids, peekId: 'T-9' };
    expect(reduceIssuePeekKey(state, 'next')).toBeNull();
    expect(reduceIssuePeekKey(state, 'previous')).toBeNull();
    expect(reduceIssuePeekKey(state, 'togglePeek')).toBeNull();
    expect(reduceIssuePeekKey(state, 'openPage')).toBeNull();
  });

  it('needs a current row for Space and Enter', () => {
    expect(reduceIssuePeekKey({ currentId: null, ids, peekId: null }, 'togglePeek')).toBeNull();
    expect(reduceIssuePeekKey({ currentId: null, ids, peekId: null }, 'openPage')).toBeNull();
  });
});

describe('issuePeekKeyFromEvent', () => {
  const press = (
    key: string,
    mods: Partial<Record<'alt' | 'ctrl' | 'meta' | 'shift', boolean>> = {},
  ) =>
    issuePeekKeyFromEvent({
      altKey: Boolean(mods.alt),
      ctrlKey: Boolean(mods.ctrl),
      key,
      metaKey: Boolean(mods.meta),
      shiftKey: Boolean(mods.shift),
    });

  it('maps the Linear key set', () => {
    expect(press('j')).toBe('next');
    expect(press('ArrowDown')).toBe('next');
    expect(press('k')).toBe('previous');
    expect(press('ArrowUp')).toBe('previous');
    expect(press(' ')).toBe('togglePeek');
    expect(press('Enter')).toBe('openPage');
    expect(press('Escape')).toBe('closePeek');
  });

  it('ignores other keys', () => {
    expect(press('a')).toBeNull();
    expect(press('Tab')).toBeNull();
  });

  it('never fires with a modifier held', () => {
    expect(press('j', { meta: true })).toBeNull();
    expect(press('k', { ctrl: true })).toBeNull();
    expect(press('Enter', { alt: true })).toBeNull();
    expect(press(' ', { shift: true })).toBeNull();
    expect(press('Escape', { meta: true })).toBeNull();
  });
});

describe('collapsed group focus ownership', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });
  const surface = () => {
    const owner = document.createElement('div');
    owner.dataset.workSurface = '';
    const list = document.createElement('div');
    owner.append(list);
    document.body.append(owner);
    return { owner, list };
  };
  const header = (list: HTMLElement) => {
    const button = document.createElement('button');
    button.dataset.workGroupHeader = 'todo';
    list.append(button);
    return button;
  };

  it('does not let a sibling pane consume the same collapse key', () => {
    const left = surface();
    const right = surface();
    header(left.list);
    requestIssueGroupHeaderFocus(right.owner, 'todo');
    expect(restoreIssueGroupHeaderFocus(left.list)).toBe(false);
    const target = header(right.list);
    expect(restoreIssueGroupHeaderFocus(right.list)).toBe(true);
    expect(document.activeElement).toBe(target);
  });

  it('keeps an intent through list remount and delayed header creation', () => {
    const { owner, list } = surface();
    requestIssueGroupHeaderFocus(owner, 'todo');
    list.remove();
    const replacement = document.createElement('div');
    owner.append(replacement);
    expect(restoreIssueGroupHeaderFocus(replacement)).toBe(false);
    const target = header(replacement);
    expect(restoreIssueGroupHeaderFocus(replacement)).toBe(true);
    expect(document.activeElement).toBe(target);
    expect(restoreIssueGroupHeaderFocus(replacement)).toBe(false);
  });

  it('does not consume an intent while the owning retained pane is hidden', () => {
    const { owner, list } = surface();
    const target = header(list);
    owner.hidden = true;
    requestIssueGroupHeaderFocus(owner, 'todo');
    expect(restoreIssueGroupHeaderFocus(list)).toBe(false);
    owner.hidden = false;
    expect(restoreIssueGroupHeaderFocus(list)).toBe(true);
    expect(document.activeElement).toBe(target);
  });

  it('keeps each surface latest intent independent', () => {
    const left = surface();
    const right = surface();
    const leftHeader = header(left.list);
    const rightHeader = header(right.list);
    requestIssueGroupHeaderFocus(left.owner, 'todo');
    requestIssueGroupHeaderFocus(right.owner, 'todo');
    expect(restoreIssueGroupHeaderFocus(left.list)).toBe(true);
    expect(document.activeElement).toBe(leftHeader);
    expect(restoreIssueGroupHeaderFocus(right.list)).toBe(true);
    expect(document.activeElement).toBe(rightHeader);
  });
});
