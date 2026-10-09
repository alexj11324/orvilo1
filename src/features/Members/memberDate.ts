import { formatAbsoluteDate } from '@orvilo/utils/time';

/** Joined/invited dates are absolute numeric days (`2026/09/18`), never month names. */
export const formatMemberDate = (value: Date | string | null | undefined): string =>
  formatAbsoluteDate(value) || '—';
