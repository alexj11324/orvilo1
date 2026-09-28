import type { LucideIcon } from 'lucide-react';
import { Link2Icon } from 'lucide-react';

import { FAVORITE_MARK, FAVORITE_MARK_OFF } from './favoriteIcons';

/**
 * Model of the per-team `⋯` menu in "Your teams" (Linear renders a hover
 * action on each team row). Pure data — `TeamsSection` binds the handlers and
 * translates `labelKey`; the pinned flag alone decides which direction the
 * favorite entry points. Only entries backed by a real surface ship here:
 * pin/unpin goes through the work-attention favorites API, copy link builds
 * the workspace-aware team URL.
 */
export interface TeamMenuEntry {
  icon: LucideIcon;
  key: 'copyLink' | 'favorite';
  labelKey: 'savedViews.copyLink' | 'savedViews.favorite' | 'savedViews.unfavorite';
}

export const buildTeamMenuEntries = (pinned: boolean): TeamMenuEntry[] => [
  {
    icon: pinned ? FAVORITE_MARK_OFF.pin : FAVORITE_MARK.pin,
    key: 'favorite',
    labelKey: pinned ? 'savedViews.unfavorite' : 'savedViews.favorite',
  },
  {
    icon: Link2Icon,
    key: 'copyLink',
    labelKey: 'savedViews.copyLink',
  },
];
