import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveIssueKeyScope } from './issuePeekKeyContext';
import { useIssuePeekKeyboard } from './useIssuePeekKeyboard';

const mount = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
};

const IDS = ['T-1', 'T-2', 'T-3'];

const rowsHtml = IDS.map(
  (id) =>
    `<div data-issue-row="${id}" role="button" tabindex="0"><button data-testid="${id}-menu">menu</button><a href="/x" data-testid="${id}-link">x</a></div>`,
).join('');

const press = (target: Element | Document, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('resolveIssueKeyScope', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports the focused row and yields outside the list', () => {
    const host = mount(
      `${rowsHtml}<aside data-issue-peek-pane><p id="pane">pane</p></aside><nav id="nav" tabindex="0"></nav>`,
    );
    const row = host.querySelector('[data-issue-row="T-2"]')!;
    expect(resolveIssueKeyScope(row)).toEqual({ fromList: true, onControl: false, rowId: 'T-2' });
    expect(resolveIssueKeyScope(document.body)).toEqual({
      fromList: true,
      onControl: false,
      rowId: null,
    });
    expect(resolveIssueKeyScope(host.querySelector('#pane'))).toEqual({
      fromList: false,
      onControl: false,
      rowId: null,
    });
    expect(resolveIssueKeyScope(host.querySelector('#nav'))).toBeNull();
  });

  it('flags a control inside the row but not the row root itself', () => {
    const host = mount(rowsHtml);
    expect(resolveIssueKeyScope(host.querySelector('[data-testid="T-1-menu"]'))?.onControl).toBe(
      true,
    );
    expect(resolveIssueKeyScope(host.querySelector('[data-testid="T-1-link"]'))?.onControl).toBe(
      true,
    );
    expect(resolveIssueKeyScope(host.querySelector('[data-issue-row="T-1"]'))?.onControl).toBe(
      false,
    );
  });

  it('yields to typing: inputs, textareas and contenteditable (the peek editors)', () => {
    const host = mount(
      `<aside data-issue-peek-pane><input id="i"><textarea id="t"></textarea><div id="c" contenteditable="true"><span id="cs">x</span></div></aside>`,
    );
    expect(resolveIssueKeyScope(host.querySelector('#i'))).toBeNull();
    expect(resolveIssueKeyScope(host.querySelector('#t'))).toBeNull();
    expect(resolveIssueKeyScope(host.querySelector('#c'))).toBeNull();
    expect(resolveIssueKeyScope(host.querySelector('#cs'))).toBeNull();
  });

  it('yields while a menu, dialog, listbox or popup trigger is open', () => {
    for (const overlay of [
      '<div role="menu"></div>',
      '<div role="dialog"></div>',
      '<div role="listbox"></div>',
      '<div cmdk-root=""></div>',
      '<button data-popup-open>open</button>',
    ]) {
      const host = mount(`${rowsHtml}${overlay}`);
      expect(resolveIssueKeyScope(host.querySelector('[data-issue-row="T-1"]'))).toBeNull();
      host.remove();
    }
  });
});

describe('useIssuePeekKeyboard', () => {
  const onPeek = vi.fn();
  const onOpenPage = vi.fn();

  beforeEach(() => {
    onPeek.mockReset();
    onOpenPage.mockReset();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const setup = (peekId: string | null = null, extra: { enabled?: boolean } = {}) =>
    renderHook(() => useIssuePeekKeyboard({ ids: IDS, onOpenPage, onPeek, peekId, ...extra }));

  it('Space on a focused row toggles the peek and stops the row from navigating', () => {
    const host = mount(rowsHtml);
    const rowHandler = vi.fn();
    host.addEventListener('keydown', rowHandler);
    setup();
    const event = press(host.querySelector('[data-issue-row="T-2"]')!, ' ');
    expect(onPeek).toHaveBeenCalledWith('T-2');
    expect(event.defaultPrevented).toBe(true);
    expect(rowHandler).not.toHaveBeenCalled();
  });

  it('opening the peek leaves focus on the list, even if the list remounts', async () => {
    const host = mount(rowsHtml);
    const { unmount } = setup();
    press(host.querySelector('[data-issue-row="T-2"]')!, ' ');
    // The host re-parents the list when the pane opens: old row gone, new one in.
    unmount();
    host.innerHTML = rowsHtml;
    await waitFor(() =>
      expect(document.activeElement).toBe(host.querySelector('[data-issue-row="T-2"]')),
    );
  });

  it('Space on the peeked row closes it', () => {
    const host = mount(rowsHtml);
    setup('T-2');
    press(host.querySelector('[data-issue-row="T-2"]')!, ' ');
    expect(onPeek).toHaveBeenCalledWith(null);
  });

  it('J / K move focus and an open peek follows', async () => {
    const host = mount(rowsHtml);
    setup('T-1');
    const first = host.querySelector<HTMLElement>('[data-issue-row="T-1"]')!;
    first.focus();
    press(first, 'j');
    expect(onPeek).toHaveBeenCalledWith('T-2');
    await waitFor(() =>
      expect(document.activeElement).toBe(host.querySelector('[data-issue-row="T-2"]')),
    );
  });

  it('J without a peek only moves focus', async () => {
    const host = mount(rowsHtml);
    setup(null);
    press(host.querySelector('[data-issue-row="T-1"]')!, 'ArrowDown');
    expect(onPeek).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(host.querySelector('[data-issue-row="T-2"]')),
    );
  });

  it('Enter opens the full page for the focused row', () => {
    const host = mount(rowsHtml);
    setup();
    press(host.querySelector('[data-issue-row="T-3"]')!, 'Enter');
    expect(onOpenPage).toHaveBeenCalledWith('T-3');
  });

  it('Esc closes the peek and returns focus to its row', async () => {
    const host = mount(
      `${rowsHtml}<aside data-issue-peek-pane><button id="close">x</button></aside>`,
    );
    setup('T-2');
    const event = press(host.querySelector('#close')!, 'Escape');
    expect(onPeek).toHaveBeenCalledWith(null);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(host.querySelector('[data-issue-row="T-2"]')),
    );
  });

  it('leaves Esc alone when no peek is open', () => {
    const host = mount(rowsHtml);
    setup(null);
    const event = press(host.querySelector('[data-issue-row="T-1"]')!, 'Escape');
    expect(onPeek).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps Space and Enter native on a button or link inside the row', () => {
    const host = mount(rowsHtml);
    setup();
    const menu = host.querySelector('[data-testid="T-1-menu"]')!;
    expect(press(menu, ' ').defaultPrevented).toBe(false);
    expect(press(menu, 'Enter').defaultPrevented).toBe(false);
    expect(press(host.querySelector('[data-testid="T-1-link"]')!, ' ').defaultPrevented).toBe(
      false,
    );
    expect(onPeek).not.toHaveBeenCalled();
    expect(onOpenPage).not.toHaveBeenCalled();
  });

  it('does nothing while typing in the peek editor', () => {
    const host = mount(
      `${rowsHtml}<aside data-issue-peek-pane><div id="title" contenteditable="true"></div><input id="field"></aside>`,
    );
    setup('T-1');
    for (const id of ['#title', '#field']) {
      for (const key of ['j', 'k', ' ', 'Enter', 'Escape']) {
        expect(press(host.querySelector(id)!, key).defaultPrevented).toBe(false);
      }
    }
    expect(onPeek).not.toHaveBeenCalled();
    expect(onOpenPage).not.toHaveBeenCalled();
  });

  it('does nothing with a modifier, an open menu, or from unrelated regions', () => {
    const host = mount(`${rowsHtml}<nav id="nav" tabindex="0"></nav>`);
    setup('T-1');
    const row = host.querySelector('[data-issue-row="T-2"]')!;
    expect(press(row, 'j', { metaKey: true }).defaultPrevented).toBe(false);
    expect(press(row, ' ', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(host.querySelector('#nav')!, 'j').defaultPrevented).toBe(false);
    const menu = mount('<div role="menu"></div>');
    expect(press(row, 'j').defaultPrevented).toBe(false);
    expect(press(row, 'Escape').defaultPrevented).toBe(false);
    menu.remove();
    expect(onPeek).not.toHaveBeenCalled();
  });

  it('ignores a held key for Space', () => {
    const host = mount(rowsHtml);
    setup();
    press(host.querySelector('[data-issue-row="T-1"]')!, ' ', { repeat: true });
    expect(onPeek).not.toHaveBeenCalled();
  });

  it('does not bind when disabled', () => {
    const host = mount(rowsHtml);
    setup(null, { enabled: false });
    const event = press(host.querySelector('[data-issue-row="T-1"]')!, ' ');
    expect(onPeek).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('lets Enter fall through to the row when the host has no full-page handler', () => {
    const host = mount(rowsHtml);
    renderHook(() => useIssuePeekKeyboard({ ids: IDS, onPeek, peekId: null }));
    expect(press(host.querySelector('[data-issue-row="T-1"]')!, 'Enter').defaultPrevented).toBe(
      false,
    );
  });
});
