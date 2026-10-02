import { describe, expect, it, vi } from 'vitest';

import { inboxRowSelectKeyDown } from './inboxRowKeyboard';

const event = (key: string, { selfTarget = true } = {}) => {
  const target = selfTarget ? document.createElement('div') : document.createElement('button');
  return {
    currentTarget: selfTarget ? target : document.createElement('div'),
    key,
    preventDefault: vi.fn(),
    target,
  };
};

describe('inboxRowSelectKeyDown', () => {
  it('activates the row on Enter and Space when the row itself is focused', () => {
    const selectRow = vi.fn();
    for (const key of ['Enter', ' ']) {
      const e = event(key);
      inboxRowSelectKeyDown(e, selectRow);
    }
    expect(selectRow).toHaveBeenCalledTimes(2);
  });

  // Regression: the revealed action buttons bubble keydown to the row — the
  // row must not preventDefault them (Enter would never activate the button)
  // nor trigger row selection (Space would double-fire select + action).
  it('ignores keys that originate on the revealed action buttons', () => {
    const selectRow = vi.fn();
    const e = event('Enter', { selfTarget: false });
    inboxRowSelectKeyDown(e, selectRow);
    expect(selectRow).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores keys from portaled menu items inside the row', () => {
    const selectRow = vi.fn();
    const menuItem = document.createElement('div');
    menuItem.setAttribute('role', 'menuitem');
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.append(menuItem);
    const e = {
      currentTarget: document.createElement('div'),
      key: 'Enter',
      preventDefault: vi.fn(),
      target: menuItem,
    };
    inboxRowSelectKeyDown(e, selectRow);
    expect(selectRow).not.toHaveBeenCalled();
  });

  it('ignores non-activation keys', () => {
    const selectRow = vi.fn();
    inboxRowSelectKeyDown(event('Tab'), selectRow);
    expect(selectRow).not.toHaveBeenCalled();
  });
});
