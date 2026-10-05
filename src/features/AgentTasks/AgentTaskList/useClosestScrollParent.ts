import { useCallback, useLayoutEffect, useState } from 'react';

const isScrollable = (element: HTMLElement) => {
  const { overflowY } = getComputedStyle(element);
  return overflowY === 'auto' || overflowY === 'scroll';
};

/** Nearest ancestor that actually scrolls. Missing means the list must not stay blank. */
export const closestScrollParent = (node: HTMLElement | null): HTMLElement | undefined => {
  let current = node?.parentElement ?? null;
  while (current && !isScrollable(current)) current = current.parentElement;
  return current ?? undefined;
};

/**
 * Resolve the nearest scrolling ancestor of an anchor element so a windowed
 * list (`react-virtuoso` `customScrollParent`) can attach to the page's own
 * scroller instead of nesting a second one. The anchor is attached via a
 * callback ref, so the parent resolves on mount and re-resolves when the
 * anchor is remounted under another container.
 *
 * Measurement runs before paint, then once more on the next frame when the
 * first pass misses a style that lands after commit. `unresolved` stays true
 * only until that second pass, so a miss does not leave the list blank.
 */
export const useClosestScrollParent = () => {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [scrollParent, setScrollParent] = useState<HTMLElement>();
  const [unresolved, setUnresolved] = useState(true);

  const ref = useCallback((next: HTMLDivElement | null) => {
    setNode(next);
  }, []);

  useLayoutEffect(() => {
    if (!node) {
      setScrollParent(undefined);
      setUnresolved(true);
      return;
    }
    const found = closestScrollParent(node);
    if (found) {
      setScrollParent(found);
      setUnresolved(false);
      return;
    }
    setScrollParent(undefined);
    const frame = requestAnimationFrame(() => {
      const retry = closestScrollParent(node);
      setScrollParent(retry);
      setUnresolved(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [node]);

  return { ref, scrollParent, unresolved };
};
