import dayjs from 'dayjs';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * The reference inbox prints relative times in their shortest unit —
 * `4h`, `6h`, `1d`, `16d`, `7w` — never `24 minutes ago`.
 */
export const compactInboxTime = (iso: string | number | Date, now = Date.now()): string => {
  const diff = Math.max(0, now - dayjs(iso).valueOf());
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MINUTE))}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;
  return `${Math.floor(diff / WEEK)}w`;
};
