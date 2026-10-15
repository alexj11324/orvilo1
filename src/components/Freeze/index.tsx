'use client';

import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { useFreezeSnapshot } from './useFreezeSnapshot';

const suspended = new Promise<never>(() => {});
function Suspend(): never {
  throw suspended;
}
/** Suspend reconciliation while keeping the last committed tree painted during a closing transition. */
export function Freeze({ frozen, children }: { children?: ReactNode; frozen?: boolean }) {
  const { root, shouldSuspend } = useFreezeSnapshot(frozen);
  return (
    <Suspense fallback={null}>
      {shouldSuspend && <Suspend />}
      <div className="contents" ref={root}>
        {children}
      </div>
    </Suspense>
  );
}
