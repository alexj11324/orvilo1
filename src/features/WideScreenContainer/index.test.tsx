import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import WideScreenContainer from './index';

afterEach(() => {
  cleanup();
});

// A caller-supplied `style` prop must merge into the inner column's computed
// styles — the centered width cap and inline padding are the contract the
// conversation rows (incl. the bottom-compensation spacer) rely on.
describe('WideScreenContainer', () => {
  it('keeps computed column styles when a caller style prop is passed', () => {
    const { container } = render(
      <WideScreenContainer style={{ position: 'relative' }}>
        <div style={{ width: '100%' }} />
      </WideScreenContainer>,
    );

    const inner = container.firstElementChild!.firstElementChild as HTMLElement;
    // happy-dom drops min() widths from the CSSOM, so the width cap is covered
    // by the override case below; paddingInline surviving proves the computed
    // style object was not clobbered by the caller's style prop.
    expect(inner.style.paddingInline).toBe('16px');
    expect(inner.style.position).toBe('relative');
  });

  it('lets caller style values win on direct conflicts', () => {
    const { container } = render(
      <WideScreenContainer style={{ width: '42px' }}>child</WideScreenContainer>,
    );

    const inner = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(inner.style.width).toBe('42px');
    expect(inner.style.paddingInline).toBe('16px');
  });
});
