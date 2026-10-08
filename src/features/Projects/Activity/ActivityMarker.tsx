import {
  Archive,
  BadgeCheck,
  CirclePlay,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports -- review-rejected event kind, not a status mark
  CircleX,
  Timer,
  UserRoundCog,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import Avatar from '@/components/Avatar';
import { STATUS_PROPERTY_ICON, WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { PRIORITY_ICONS, resolvePriorityLevel } from '@/components/PriorityIcon';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';

import type { ActivityGlyph, ActivityMarker as ActivityMarkerSpec } from './activityMarkers';

const MARK_SIZE = 14;

const GLYPHS: Record<ActivityGlyph, ComponentType<{ size?: number | string }>> = {
  archive: Archive,
  assignee: UserRoundCog,
  automation: Timer,
  badgeCheck: BadgeCheck,
  circlePlay: CirclePlay,
  circleX: CircleX,
  statusProperty: STATUS_PROPERTY_ICON,
};

interface ActivityMarkerProps {
  /** Only read for `avatar` markers. */
  actor?: { avatar?: string | null; name?: string | null } | null;
  marker: ActivityMarkerSpec;
}

/** Renders the one mark a feed line carries, at the shared 14px glyph size. */
export const ActivityMarker = ({ actor, marker }: ActivityMarkerProps): ReactNode => {
  switch (marker.kind) {
    case 'avatar': {
      return (
        <Avatar
          avatar={actor?.avatar ?? undefined}
          name={actor?.name ?? undefined}
          size={MARK_SIZE + 6}
        />
      );
    }
    case 'milestone': {
      return <MilestoneIcon size={MARK_SIZE} />;
    }
    case 'priority': {
      const Icon = PRIORITY_ICONS[resolvePriorityLevel(marker.level)];
      return <Icon size={MARK_SIZE} />;
    }
    case 'workflow': {
      const { color, icon: Icon } = WORKFLOW_CATEGORY_VISUALS[marker.category];
      return <Icon color={color} size={MARK_SIZE} />;
    }
    default: {
      const Icon = GLYPHS[marker.glyph];
      return <Icon size={MARK_SIZE} />;
    }
  }
};
