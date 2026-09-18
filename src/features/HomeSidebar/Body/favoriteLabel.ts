import type { NavigationFavoriteTargetType } from '@orvilo/types';

/** Sidebar labels never use the raw target id — lost ACL stays a typed placeholder. */
export const favoriteLabel = (
  targetType: NavigationFavoriteTargetType,
  title: string | null | undefined,
  t: (key: string) => string,
): string => {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  return t(`favorites.${targetType}`);
};
