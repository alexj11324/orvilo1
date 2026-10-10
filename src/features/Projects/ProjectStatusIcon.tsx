'use client';

import { memo } from 'react';

import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';

import { PROJECT_STATUS_PERIMETER, ProjectActiveStatusIcon } from './ProjectActiveStatusIcon';

/** One project lifecycle glyph family across lists, headers and property pickers. */
export const ProjectStatusIcon = memo<{
  percent?: number;
  size?: number;
  status?: null | string;
}>(({ status, size = 16, percent }) => {
  const resolved = resolveProjectStatus(status);
  const visual = PROJECT_STATUS_VISUALS[resolved];
  if (resolved === 'active')
    return <ProjectActiveStatusIcon color={visual.color} percent={percent ?? 0} size={size} />;
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      style={{ color: visual.color, flex: 'none' }}
      viewBox="-1 -1 16 16"
      width={size}
    >
      <path
        d={PROJECT_STATUS_PERIMETER}
        fill={resolved === 'completed' || resolved === 'canceled' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeDasharray={resolved === 'backlog' ? '1.65 1.35' : undefined}
        strokeLinejoin="bevel"
        strokeWidth={1.5}
      />
      {resolved === 'completed' && (
        <path
          d="m4 7 2 2 4-4"
          stroke={'var(--card)'}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      )}
      {resolved === 'canceled' && (
        <path
          d="m4.5 4.5 5 5m0-5-5 5"
          stroke={'var(--card)'}
          strokeLinecap="round"
          strokeWidth={1.5}
        />
      )}
      {resolved === 'paused' && (
        <path d="M5.5 4.5v5m3-5v5" stroke="currentColor" strokeWidth={1.5} />
      )}
      {resolved === 'reviewing' && (
        <path
          d="m4 7 2 2 4-4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      )}
      {resolved === 'archived' && (
        <path d="M4.5 5.5h5m-4.5 0v4h4v-4M6 7h2" stroke="currentColor" strokeWidth={1} />
      )}
    </svg>
  );
});

ProjectStatusIcon.displayName = 'ProjectStatusIcon';
