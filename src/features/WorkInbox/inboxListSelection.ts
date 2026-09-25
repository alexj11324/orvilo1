export const nextInboxSelection = (
  ids: string[],
  selectedId: string | null,
  delta: -1 | 1,
): string | null => {
  if (ids.length === 0) return null;
  const index = selectedId ? ids.indexOf(selectedId) : -1;
  if (index < 0) return delta > 0 ? ids[0]! : ids.at(-1)!;
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))] ?? null;
};

/**
 * Keep the row currently being read in place when opening it changes the
 * server-side bucket (for example, an unread mention leaves Priority once its
 * read receipt lands). The row disappears after the user leaves the selection,
 * so this preserves reading position without weakening the feed query.
 */
export interface InboxReadReceiptRetention<T extends { notificationId: string }> {
  card: T;
  index: number;
  scope: string;
}

export interface InboxReadReceiptAttempt {
  activityVersion: number;
  notificationId: string;
  scope: string;
}

export const armInboxReadReceiptSuppression = ({
  activityVersion,
  notificationId,
  scope,
  selectedId,
}: InboxReadReceiptAttempt & { selectedId: string | null }): InboxReadReceiptAttempt | null =>
  notificationId === selectedId ? { activityVersion, notificationId, scope } : null;

export const resolveInboxReadReceiptAttempt = (
  attempt: InboxReadReceiptAttempt | null,
  selectedId: string | null,
  scope: string,
): InboxReadReceiptAttempt | null => {
  if (!attempt || attempt.scope !== scope || attempt.notificationId !== selectedId) return null;
  return attempt;
};

export const resolveInboxReadReceiptRetention = <T extends { notificationId: string }>(
  retained: InboxReadReceiptRetention<T> | null,
  selectedId: string | null,
  scope: string,
): InboxReadReceiptRetention<T> | null => {
  if (!retained || retained.scope !== scope || retained.card.notificationId !== selectedId) {
    return null;
  }
  return retained;
};

export const retainSelectedInboxCard = <T extends { notificationId: string }>(
  cards: T[],
  selected: T | null,
  retention: InboxReadReceiptRetention<T> | null,
): T[] => {
  if (
    !retention ||
    !selected ||
    retention.card.notificationId !== selected.notificationId ||
    cards.some((card) => card.notificationId === selected.notificationId)
  ) {
    return cards;
  }

  const next = [...cards];
  const insertionIndex = Math.min(Math.max(retention.index, 0), next.length);
  next.splice(insertionIndex, 0, selected);
  return next;
};
