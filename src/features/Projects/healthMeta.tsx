'use client';

import type { ProjectHealth } from '@orvilo/types';
import { CircleDashedIcon, CircleIcon } from 'lucide-react';
import { memo } from 'react';

/**
 * Project health is the traffic light carried by the latest project update —
 * it is not a lifecycle/status field. Linear renders it as a filled dot
 * (green/yellow/red); a status glyph like a checkmark or alert octagon would
 * read as success/failure, so the icon is always the same filled circle and
 * only the color carries the meaning. `key` is the `project:` namespace
 * label; `color` retains the public engine token metadata. The dot and label
 * consume the same contrast-checked `*-text` role rather than an action fill.
 * The filled-circle shape still denotes update health, not completion.
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
    /** Retained public engine color token metadata for existing consumers. */
    color: 'colorError' | 'colorSuccess' | 'colorWarning';
    key: string;
    /** lobehub `Tag` system-preset name for the same semantic color. */
    tag: 'error' | 'success' | 'warning';
    /** Contrast-checked status role shared by the label and filled health glyph. */
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
  ({ health, size = 16 }) => {
    if (!health || !(health in PROJECT_HEALTH_META)) {
      return <CircleDashedIcon aria-hidden className="text-muted-foreground" size={size} />;
    }
    return (
      <CircleIcon
        aria-hidden
        className={PROJECT_HEALTH_META[health].textClass}
        fill="currentColor"
        size={size}
      />
    );
  },
);

ProjectHealthIcon.displayName = 'ProjectHealthIcon';
