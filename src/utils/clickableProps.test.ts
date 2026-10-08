import { describe, expect, it, vi } from 'vitest';

import { activateOnKey, clickableProps } from './clickableProps';

const makeEvent = (key: string, overrides: Partial<Parameters<typeof activateOnKey>[0]> = {}) => {
  const element = { click: vi.fn() };
  const preventDefault = vi.fn();
  const event = {
    currentTarget: element as unknown as EventTarget,
    key,
    preventDefault,
    target: element as unknown as EventTarget,
    ...overrides,
  };
  return { element, event, preventDefault };
};

describe('activateOnKey', () => {
  it.each(['Enter', ' '])('clicks the element on %j', (key) => {
    const { element, event, preventDefault } = makeEvent(key);
    activateOnKey(event);
    expect(element.click).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const { element, event, preventDefault } = makeEvent('a');
    activateOnKey(event);
    expect(element.click).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does not steal keys bubbling from a nested control', () => {
    const { element, event, preventDefault } = makeEvent('Enter', {
      target: {} as unknown as EventTarget,
    });
    activateOnKey(event);
    expect(element.click).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('clickableProps', () => {
  it('makes the element a focusable button with keyboard activation', () => {
    expect(clickableProps()).toEqual({
      onKeyDown: activateOnKey,
      role: 'button',
      tabIndex: 0,
    });
  });

  it('returns nothing when the click is inert', () => {
    expect(clickableProps(false)).toEqual({});
  });
});
