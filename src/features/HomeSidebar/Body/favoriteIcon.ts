import type { NavigationFavoriteTargetType } from '@orvilo/types';
import type { LucideIcon } from 'lucide-react';
import { LayoutList, ListChecksIcon, Users } from 'lucide-react';

import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';

/**
 * Leading glyph for a Favorites row, keyed by target type. The favorite payload
 * carries no per-entity icon, so rows fall back to the same glyphs the fixed IA
 * uses for that surface (project list, views directory, issues, team).
 */
export const FAVORITE_TARGET_ICONS: Record<NavigationFavoriteTargetType, LucideIcon> = {
  project: PROJECT_ENTITY_ICON,
  savedView: LayoutList,
  task: ListChecksIcon,
  team: Users,
};
