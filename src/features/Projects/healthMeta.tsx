'use client';

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
 * label; `color` names the antd token the dot resolves against the theme and
 * `textClass` the `*-text` role the label takes: the fill colour is not
 * text-safe on a light canvas (amber 2.2:1, green 3.5:1), the text role is.
 */
export const PROJECT_HEALTH_META = {
  atRisk: {
    color: 'colorWarning',
    key: 'list.health.atRisk',
    tag: 'warning',
    textClass: 'text-warning-text',
  },
  offTrack: {
    color: 'colorError',
    key: 'list.health.offTrack',
    tag: 'error',
    textClass: 'text-destructive-text',
  },
  onTrack: {
    color: 'colorSuccess',
    key: 'list.health.onTrack',
    tag: 'success',
    textClass: 'text-success-text',
  },
} as const satisfies Record<
  ProjectHealth,
  {
    /** antd token the dot resolves against the theme (`theme[color]`). */
    color: 'colorError' | 'colorSuccess' | 'colorWarning';
    key: string;
    /** lobehub `Tag` system-preset name for the same semantic color. */
    tag: 'error' | 'success' | 'warning';
    /** Text-safe status role for the label (the dot keeps the fill colour). */
    textClass: 'text-destructive-text' | 'text-success-text' | 'text-warning-text';
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
      return <CircleDashedIcon aria-hidden color={theme.colorTextQuaternary} size={size} />;
    }
    const color = theme[PROJECT_HEALTH_META[health].color];
    return <CircleIcon aria-hidden color={color} fill={color} size={size} />;
  },
);

ProjectHealthIcon.displayName = 'ProjectHealthIcon';
