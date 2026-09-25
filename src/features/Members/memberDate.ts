/**
 * Joined/invited dates in the reference render as `MMM d` while recent and
 * collapse to `MMM yyyy` once they age out (e.g. "Sep 18" vs "Feb 2026").
 * The crossover sits between ~3 and ~6 months in the reference capture; 150
 * days is the midpoint that reproduces every observed sample.
 */
const RECENT_THRESHOLD_MS = 150 * 24 * 60 * 60 * 1000;

export const formatMemberDate = (
  value: Date | string | null | undefined,
  now: number = Date.now(),
): string => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const recent = now - date.getTime() < RECENT_THRESHOLD_MS;
  return date.toLocaleDateString(
    undefined,
    recent ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' },
  );
};
