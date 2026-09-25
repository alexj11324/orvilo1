'use client';

import { useId } from 'react';

/**
 * The 14px "Add new view" glyph (16-unit grid) of the reference Team Issues toolbar: a filled
 * layer with a plus knocked out, stacked on an open second layer.
 */
export function AddViewIcon() {
  const maskId = useId();

  return (
    <svg aria-hidden="true" fill="none" height={14} viewBox="0 0 16 16" width={14}>
      <mask id={maskId}>
        <rect fill="white" height={16} width={16} />
        <path d="M8 3.75v3.5M6.25 5.5h3.5" stroke="black" strokeLinecap="round" strokeWidth={1.5} />
      </mask>
      <path
        d="M8 1.75 13.75 5.5 8 9.25 2.25 5.5Z"
        fill="currentColor"
        mask={`url(#${maskId})`}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <path
        d="M2.25 9.5 8 13.25l5.75-3.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
      />
    </svg>
  );
}
