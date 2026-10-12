import { render } from '@testing-library/react';
import { Activity, createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { useRevealEpoch } from './useRevealEpoch';

const epochs: number[] = [];
const Probe = () => {
  epochs.push(useRevealEpoch());
  return null;
};
const pane = (mode: 'hidden' | 'visible') =>
  createElement(Activity, { children: createElement(Probe), mode });

describe('useRevealEpoch', () => {
  it('stays at 0 while the component is never hidden', () => {
    epochs.length = 0;
    const { rerender } = render(pane('visible'));
    rerender(pane('visible'));

    expect(epochs.at(-1)).toBe(0);
  });

  it('counts each return from a hidden Activity', () => {
    epochs.length = 0;
    const { rerender } = render(pane('visible'));

    rerender(pane('hidden'));
    rerender(pane('visible'));
    expect(epochs.at(-1)).toBe(1);

    rerender(pane('hidden'));
    rerender(pane('visible'));
    expect(epochs.at(-1)).toBe(2);
  });
});
