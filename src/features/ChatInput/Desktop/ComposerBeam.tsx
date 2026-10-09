'use client';

import { BorderBeam } from 'border-beam';
import type { ReactNode } from 'react';

import { useIsDark } from '@/hooks/useIsDark';

// Rotate presets delegate reduced-motion to consumers (BorderBeam README, Accessibility).
// Finish root transitions immediately so the package still receives animationend and
// clears its fade-out state. Decorative layers never loop in reduced-motion mode.
const reducedMotionCss = `
@media (prefers-reduced-motion: reduce) {
  [data-beam="{id}"] {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
  [data-beam="{id}"]::before,
  [data-beam="{id}"]::after,
  [data-beam="{id}"] [data-beam-bloom] {
    animation: none !important;
  }
}
`;

/** Keep the editor mounted as work starts/stops; only the library's effect changes. */
export default function ComposerBeam({
  active,
  children,
  fullscreen,
}: {
  active?: boolean;
  children: ReactNode;
  fullscreen?: boolean;
}) {
  const dark = useIsDark();
  // Only conversation callers opt in. Other editor surfaces retain their existing DOM.
  if (active === undefined) return children;
  return (
    <BorderBeam
      active={active}
      borderRadius={fullscreen ? 0 : 12}
      colorVariant="colorful"
      css={reducedMotionCss}
      data-testid="conversation-composer-beam"
      strength={0.7}
      theme={dark ? 'dark' : 'light'}
      style={{
        flex: fullscreen ? '1 1 0' : undefined,
        height: fullscreen ? '100%' : undefined,
        minHeight: fullscreen ? 0 : undefined,
        minWidth: 0,
        overflow: 'visible',
        width: '100%',
      }}
    >
      {children}
    </BorderBeam>
  );
}
