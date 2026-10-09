import { afterEach, describe, expect, it } from 'vitest';

import { issuePeekKeyFromEvent, reduceIssuePeekKey } from './issuePeekKeyboard';
import { requestIssueGroupHeaderFocus, restoreIssueGroupHeaderFocus } from './issuePeekKeyContext';

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
