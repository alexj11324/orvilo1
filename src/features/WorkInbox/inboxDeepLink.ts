import { normalizeAsyncError } from '@/libs/swr/normalizeError';

/**
 * Whether a failed `?item=` by-id lookup is terminal — the id itself is
 * malformed (`BAD_REQUEST` on the uuid input), the row is gone (`NOT_FOUND`),
 * or it is not readable from this session (an auth wall). Terminal links drop
 * the dead param outright; anything else is transient and keeps `?item=` so
 * the detail pane's retry can still resolve it.
 */
export const inboxDeepLinkTerminal = (error: unknown): boolean => {
  const { code, retryable, status } = normalizeAsyncError(error);
  if (!retryable) return true;
  return status === 400 || status === 404 || code === 'BAD_REQUEST' || code === 'NOT_FOUND';
};

export type InboxDeepLinkStatus = 'dead' | 'failed' | 'listed' | 'loading' | 'none' | 'resolved';

/**
 * Where a `?item=` selection stands once list membership and the by-id lookup
 * are both consulted.
 *
 * - `listed`   — the card is in the loaded pages; no by-id fetch needed.
 * - `resolved` — the by-id fetch returned the card (deep link past page 1).
 * - `loading`  — a lookup is in flight or a cached `null` is revalidating.
 *                Never drop the param in this state.
 * - `dead`     — the server proved the row absent (`null`) or the request can
 *                never succeed (malformed/forbidden). The param is dropped
 *                and the list falls back with a toast.
 * - `failed`   — a transient rejection: the id may still resolve, so the
 *                param stays and the detail pane owns the retry.
 */
export const resolveInboxDeepLink = ({
  error,
  fetched,
  listed,
  selectedId,
  validating,
}: {
  /** SWR `error` of the by-id lookup. */
  error: unknown;
  /** SWR `data` of the by-id lookup — `undefined` unsettled, `null` proven absent. */
  fetched: unknown;
  /** The card is already inside the loaded pages. */
  listed: boolean;
  selectedId: string | null;
  /** SWR `isValidating` — covers first load, retries and null-cache revalidations. */
  validating: boolean;
}): InboxDeepLinkStatus => {
  if (!selectedId) return 'none';
  if (listed) return 'listed';
  // Settled data wins over a stale error from a later failed revalidation.
  if (fetched) return 'resolved';
  // A request in flight — including a cached `null` being re-confirmed —
  // must finish before the link is judged dead.
  if (validating) return 'loading';
  if (fetched === null) return 'dead';
  if (error) return inboxDeepLinkTerminal(error) ? 'dead' : 'failed';
  // Armed but never settled — wait rather than drop a possibly-valid link.
  return 'loading';
};
