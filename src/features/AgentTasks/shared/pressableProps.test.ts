import { describe, expect, it, vi } from 'vitest';

import { isActivationKey, pressableProps } from './pressableProps';

describe('isActivationKey', () => {
  it('activates on Enter and Space from the element itself', () => {
    expect(isActivationKey('Enter', true)).toBe(true);
    expect(isActivationKey(' ', true)).toBe(true);
  });

  it('ignores other keys and keys from nested controls', () => {
    expect(isActivationKey('a', true)).toBe(false);
    expect(isActivationKey('Enter', false)).toBe(false);
  });
});

describe('pressableProps', () => {
  it('is focusable and activates from the keyboard', () => {
    const onActivate = vi.fn();
    const props = pressableProps(onActivate);
    const target = {};
    const preventDefault = vi.fn();
    props.onKeyDown({ currentTarget: target, key: 'Enter', preventDefault, target } as never);
    expect(props.tabIndex).toBe(0);
    expect(props.role).toBe('button');
    expect(onActivate).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('does not activate when the key came from a nested control', () => {
    const onActivate = vi.fn();
    pressableProps(onActivate).onKeyDown({
      currentTarget: {},
      key: 'Enter',
      preventDefault: vi.fn(),
      target: {},
    } as never);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
