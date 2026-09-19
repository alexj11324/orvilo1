import type { SavedViewVisibility } from '@orvilo/types';

export const savedViewSharePatch = (
  visibility: SavedViewVisibility,
  teamId: string | null,
): { teamId: string | null; visibility: SavedViewVisibility } => {
  if (visibility === 'team') return { teamId, visibility };
  return { teamId: null, visibility };
};

export const isSavedViewShareReady = (
  visibility: SavedViewVisibility,
  teamId: string | null,
): boolean => visibility !== 'team' || Boolean(teamId);

export const savedViewCopyName = (name: string, copyLabel: string): string => {
  const trimmed = name.trim();
  return trimmed ? `${trimmed} ${copyLabel}` : copyLabel;
};
