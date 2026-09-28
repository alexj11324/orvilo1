'use client';

import { Icon } from '@lobehub/ui';
import type { ProjectHealth } from '@orvilo/types';
import { useTheme } from 'antd-style';
import { CircleDashedIcon, CircleIcon } from 'lucide-react';
import { memo } from 'react';

/**
 * Project health is the traffic light carried by the latest project update —
 * it is not a lifecycle/status field. Linear renders it as a filled dot
 * (green/yellow/red); a status glyph like a checkmark or alert octagon would
 * read as success/failure, so the icon is always the same filled circle and
 * only the color carries the meaning. `key` is the `project:` namespace
 * label; `color` names the antd token the dot resolves against the theme.
 */
export const PROJECT_HEALTH_META = {
  atRisk: { color: 'colorWarning', key: 'list.health.atRisk', tag: 'warning' },
  offTrack: { color: 'colorError', key: 'list.health.offTrack', tag: 'error' },
  onTrack: { color: 'colorSuccess', key: 'list.health.onTrack', tag: 'success' },
} as const satisfies Record<
  ProjectHealth,
  {
    /** antd token the dot resolves against the theme (`theme[color]`). */
    color: 'colorError' | 'colorSuccess' | 'colorWarning';
    key: string;
    /** lobehub `Tag` system-preset name for the same semantic color. */
    tag: 'error' | 'success' | 'warning';
  }
>;

/**
 * The health glyph: a filled dot for the three update states, the gray
 * dashed circle Linear shows when a project has no update yet. Shared by the
 * list cell, board card, timeline row, sidebar filter rows and the update
 * composer/rows so every surface renders the same semantics.
 */
export const ProjectHealthIcon = memo<{ health?: null | ProjectHealth; size?: number }>(
  ({ health, size = 12 }) => {
    const theme = useTheme();
    if (!health || !(health in PROJECT_HEALTH_META)) {
      return (
        <Icon aria-hidden color={theme.colorTextQuaternary} icon={CircleDashedIcon} size={size} />
      );
    }
    const color = theme[PROJECT_HEALTH_META[health].color];
    return <Icon aria-hidden color={color} fill={color} icon={CircleIcon} size={size} />;
  },
);

ProjectHealthIcon.displayName = 'ProjectHealthIcon';
