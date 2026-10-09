import { createElement, isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { readOnlyPickerTrigger } from './readOnlyPickerTrigger';

describe('readOnlyPickerTrigger', () => {
  it('disables a native button trigger so it leaves the tab order', () => {
    const trigger = createElement('button', { className: 'rail' }, 'Todo');

    const result = readOnlyPickerTrigger(trigger, true);

    expect(isValidElement(result)).toBe(true);
    expect((result as typeof trigger).props).toMatchObject({ className: 'rail', disabled: true });
    // The caller's element is left untouched.
    expect(trigger.props).not.toHaveProperty('disabled');
  });

  it('returns a non-button trigger unchanged', () => {
    const trigger = createElement('span', null, 'Todo');

    expect(readOnlyPickerTrigger(trigger, false)).toBe(trigger);
  });

  it('passes through a trigger that is not an element', () => {
    expect(readOnlyPickerTrigger('Todo', true)).toBe('Todo');
  });
});
