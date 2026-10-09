import { describe, expect, it } from 'vitest';

import { issuePeekKeyFromEvent, reduceIssuePeekKey } from './issuePeekKeyboard';

const ids = ['T-1', 'T-2', 'T-3'];

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
