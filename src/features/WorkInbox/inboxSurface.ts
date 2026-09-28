export type InboxSurface = 'detail' | 'list' | 'split';

/**
 * Wide screens keep the list and preview together. Narrow screens stack:
 * the list stays mounted when the preview opens so scroll and selection return.
 */
export const inboxSurface = (isNarrow: boolean, detailOpen: boolean): InboxSurface => {
  if (!isNarrow) return 'split';
  return detailOpen ? 'detail' : 'list';
};

export const shouldMarkInboxCardRead = ({
  cardId,
  selectedId,
  surface,
}: {
  cardId: string;
  selectedId: string | null;
  surface: InboxSurface;
}): boolean => selectedId === cardId && surface !== 'list';
