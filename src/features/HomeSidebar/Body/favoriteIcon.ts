import type { NavigationFavoriteTargetType } from '@orvilo/types';
import type { LucideIcon } from 'lucide-react';
import { FolderKanbanIcon, LayoutList, ListChecksIcon, Users } from 'lucide-react';

/**
 * Leading glyph for a Favorites row, keyed by target type. The favorite payload
 * carries no per-entity icon, so rows fall back to the same glyphs the fixed IA
 * uses for that surface (project list, views directory, issues, team).
 */
export const FAVORITE_TARGET_ICONS: Record<NavigationFavoriteTargetType, LucideIcon> = {
  project: FolderKanbanIcon,
  savedView: LayoutList,
  task: ListChecksIcon,
  team: Users,
};
