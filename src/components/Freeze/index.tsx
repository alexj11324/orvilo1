'use client';

import { type ReactNode, Suspense, useLayoutEffect, useRef } from 'react';

const infinitePromise = new Promise(() => {});

const Suspend = () => {
  throw infinitePromise;
};

type DisplaySnapshot = Map<HTMLElement, string>;

const snapshotDisplays = (root: HTMLElement): DisplaySnapshot => {
  const snapshot: DisplaySnapshot = new Map([[root, root.style.display]]);
  for (const element of root.querySelectorAll<HTMLElement>('*'))
    snapshot.set(element, element.style.display);
  return snapshot;
};

// Suspense hides suspended children with an inline `display: none`; undo it so
// frozen content stays visible while its updates are paused.
const restoreDisplayIfSuspenseHidden = (element: HTMLElement, originalDisplay: string) => {
  if (element.style.display !== 'none') return;
  if (originalDisplay === 'none') return;
  element.style.display = originalDisplay;
};

const restoreSuspenseHiddenDisplay = (snapshot: DisplaySnapshot) => {
  for (const [element, originalDisplay] of snapshot)
    restoreDisplayIfSuspenseHidden(element, originalDisplay);
};

interface FreezeProps {
  children?: ReactNode;
  /** Pause rendering of `children` while keeping the last committed DOM visible. */
  frozen: boolean;
}

/** Keeps a subtree mounted and visible but skips its re-renders while `frozen`. */
const Freeze = ({ frozen, children }: FreezeProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const hasSnapshotRef = useRef(false);
  const displaySnapshotRef = useRef<DisplaySnapshot | null>(null);
  const shouldSuspend = frozen && hasSnapshotRef.current;

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (!frozen || !hasSnapshotRef.current) {
      displaySnapshotRef.current = snapshotDisplays(content);
      hasSnapshotRef.current = true;
      return;
    }
    if (displaySnapshotRef.current) restoreSuspenseHiddenDisplay(displaySnapshotRef.current);
  });

  useLayoutEffect(() => {
    if (!shouldSuspend) return;
    const snapshot = displaySnapshotRef.current;
    if (!snapshot) return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target as HTMLElement;
        const originalDisplay = snapshot.get(element);
        if (originalDisplay === undefined) continue;
        restoreDisplayIfSuspenseHidden(element, originalDisplay);
      }
    });
    for (const element of snapshot.keys())
      observer.observe(element, { attributeFilter: ['style'], attributes: true });
    restoreSuspenseHiddenDisplay(snapshot);
    return () => observer.disconnect();
  }, [shouldSuspend]);

  return (
    <Suspense fallback={null}>
      {shouldSuspend && <Suspend />}
      <div className="contents" ref={contentRef}>
        {children}
      </div>
    </Suspense>
  );
};

Freeze.displayName = 'Freeze';

export default Freeze;
