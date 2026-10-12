/**
 * A run's failure reason comes from an agent or a CLI: untrusted, unbounded,
 * sometimes a whole stack trace. It is only ever shown as plain text, and the
 * page shows a readable head of it with the rest one click away.
 */
export const FAILURE_REASON_PREVIEW_LENGTH = 240;

export interface FailureReasonText {
  full: string;
  preview: string;
  truncated: boolean;
}

export const splitFailureReason = (
  reason: string | null | undefined,
  limit: number = FAILURE_REASON_PREVIEW_LENGTH,
): FailureReasonText | null => {
  const full = reason?.trim();
  if (!full) return null;
  if (full.length <= limit) return { full, preview: full, truncated: false };
  return { full, preview: `${full.slice(0, limit).trimEnd()}…`, truncated: true };
};

/** A fixed sentence for run endings that carry no recorded reason of their own. */
export const runEndingFallbackKey = (status?: string | null): string | undefined => {
  if (status === 'timeout') return 'taskDetail.runEnded.timeout';
  if (status === 'canceled') return 'taskDetail.runEnded.canceled';
  if (status === 'failed') return 'taskDetail.runEnded.failedNoReason';
  return undefined;
};

/** Whether a run row ended in a way that needs explaining. */
export const isRunEndedBadly = (status?: string | null): boolean =>
  status === 'failed' || status === 'timeout' || status === 'canceled';

/** Hover / screen-reader text for a run's status glyph: "Failed: <reason head>". */
const ENDING_LABEL_REASON_LENGTH = 120;

export const runEndingLabel = (statusLabel: string, reason?: string | null): string => {
  const text = splitFailureReason(reason, ENDING_LABEL_REASON_LENGTH);
  // One line: a tooltip cannot wrap a stack trace usefully.
  return text ? `${statusLabel}: ${text.preview.replaceAll(/\s+/g, ' ')}` : statusLabel;
};
