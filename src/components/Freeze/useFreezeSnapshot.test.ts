// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useFreezeSnapshot } from './useFreezeSnapshot';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function createSnapshot() {
  const root = document.createElement('div');
  const visible = document.createElement('span');
  const hidden = document.createElement('span');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  visible.textContent = 'committed';
  visible.style.display = 'inline-flex';
  hidden.style.display = 'none';
  svg.style.display = 'inline';
  root.append(visible, hidden, svg);
  document.body.append(root);
  return { root, visible, hidden, svg };
}

describe('useFreezeSnapshot committed display behavior', () => {
  it('captures before first freeze, restores suspension hiding, and preserves authored hidden content', async () => {
    const dom = createSnapshot();
    const { result, rerender, unmount } = renderHook(({ frozen }) => useFreezeSnapshot(frozen), {
      initialProps: { frozen: false },
    });
    act(() => {
      result.current.root.current = dom.root;
    });
    rerender({ frozen: false });
    rerender({ frozen: true });
    expect(result.current.shouldSuspend).toBe(true);
    act(() => {
      dom.root.style.display = 'none';
      dom.visible.style.display = 'none';
      dom.svg.style.display = 'none';
    });
    await waitFor(() => {
      expect(dom.root.style.display).toBe('');
      expect(dom.visible.style.display).toBe('inline-flex');
      expect(dom.svg.style.display).toBe('inline');
    });
    expect(dom.hidden.style.display).toBe('none');
    expect(dom.root.firstChild).toBe(dom.visible);
    rerender({ frozen: false });
    expect(result.current.shouldSuspend).toBe(false);
    unmount();
    dom.visible.style.display = 'none';
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(dom.visible.style.display).toBe('none');
  });

  it('allows an initially frozen first commit, suspends later updates, and captures new displays after thaw', async () => {
    const dom = createSnapshot();
    const { result, rerender } = renderHook(({ frozen }) => useFreezeSnapshot(frozen), {
      initialProps: { frozen: true },
    });
    expect(result.current.shouldSuspend).toBe(false);
    act(() => {
      result.current.root.current = dom.root;
    });
    rerender({ frozen: true });
    rerender({ frozen: true });
    expect(result.current.shouldSuspend).toBe(true);
    rerender({ frozen: false });
    dom.visible.style.display = 'grid';
    rerender({ frozen: false });
    rerender({ frozen: true });
    dom.visible.style.display = 'none';
    await waitFor(() => expect(dom.visible.style.display).toBe('grid'));
  });
});
