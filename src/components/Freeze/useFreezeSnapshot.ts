'use client';

import { useLayoutEffect, useRef } from 'react';

import { useSingleton } from '@/hooks/useSingleton';

type StyledElement = HTMLElement | SVGElement;
function restore(element: StyledElement, display: string) {
  if (element.style.display === 'none' && display !== 'none') element.style.display = display;
}

/** Capture committed displays and restore only suspension-induced hiding. */
export function useFreezeSnapshot(frozen = false) {
  const root = useRef<HTMLDivElement>(null);
  const captured = useRef(false);
  const displays = useSingleton(() => ({ current: new Map<StyledElement, string>() }));
  const shouldSuspend = !!frozen && captured.current;
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    if (!frozen || !captured.current) {
      const snapshot = new Map<StyledElement, string>([[element, element.style.display]]);
      for (const child of element.querySelectorAll<StyledElement>('*'))
        if ('style' in child) snapshot.set(child, child.style.display);
      displays.current = snapshot;
      captured.current = true;
    } else for (const [child, display] of displays.current) restore(child, display);
  });
  useLayoutEffect(() => {
    if (!shouldSuspend) return;
    const snapshot = displays.current;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target as StyledElement;
        const display = snapshot.get(element);
        if (display !== undefined) restore(element, display);
      }
    });
    for (const [element, display] of snapshot) {
      observer.observe(element, { attributeFilter: ['style'], attributes: true });
      restore(element, display);
    }
    return () => observer.disconnect();
  }, [displays, shouldSuspend]);
  return { root, shouldSuspend };
}
