'use client';

import { Icon } from '@lobehub/ui';
import { memo } from 'react';

import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';

import { ProjectActiveStatusIcon } from './ProjectActiveStatusIcon';

/**
 * The single renderer for project lifecycle status. `active` projects get the
 * measured progress-ring mark (the arc encodes issue completion); every other
 * status renders its `PROJECT_STATUS_VISUALS` glyph. Surfaces must not fall
 * back to a plain `Icon` for `active` — the same status reads as the same
 * mark everywhere (list row, board card, tab tag, filter picker, group
 * header, saved-view row).
 */
export const ProjectStatusIcon = memo<{
  percent?: number;
  size?: number;
  status?: null | string;
}>(({ status, size = 14, percent }) => {
  const resolved = resolveProjectStatus(status);
  const visual = PROJECT_STATUS_VISUALS[resolved];
  if (resolved === 'active')
    return <ProjectActiveStatusIcon color={visual.color} percent={percent ?? 0} size={size} />;
  return <Icon aria-hidden color={visual.color} icon={visual.icon} size={size} />;
});

ProjectStatusIcon.displayName = 'ProjectStatusIcon';
