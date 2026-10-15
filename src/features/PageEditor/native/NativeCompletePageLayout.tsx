'use client';

import { type ReactNode, useCallback, useEffect, useRef } from 'react';

import WideScreenContainer from '@/features/WideScreenContainer';

import type { NativePageChromeState } from './NativePageEditorAssembler';

/** Reuse the actual width preference owner so its header action affects the
 * document column. Focus blank layout space without stealing code/widget focus. */
export function NativeCompletePageLayout({
  children,
  state,
}: {
  children: ReactNode;
  state: NativePageChromeState;
}) {
  const frame = useRef<number | undefined>(undefined);
  const notify = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      window.dispatchEvent(new Event('resize'));
    });
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return (
    <WideScreenContainer
      onChange={notify}
      onClick={(event) => {
        const target = event.target;
        if (
          state.editable &&
          (target === event.currentTarget ||
            (target instanceof HTMLElement && target.dataset.slot === 'wide-screen-container'))
        )
          state.editor?.focus();
      }}
    >
      {children}
    </WideScreenContainer>
  );
}
