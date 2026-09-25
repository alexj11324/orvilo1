import {
  formatActivityTime,
  type FormatActivityTimeOptions,
  type FormattedActivityTime,
} from '@orvilo/utils/time';
import type { Dayjs } from 'dayjs';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

export type UseActivityTimeOptions = Omit<
  FormatActivityTimeOptions,
  'formatOtherYear' | 'formatRelative' | 'formatThisYear' | 'relativeThresholdMs'
> & {
  /**
   * Linear-style compact relative labels (`4d ago`, hover keeps the full
   * datetime) instead of switching to an absolute date past one day.
   */
  compact?: boolean;
};

export const compactRelative = (t: TFunction<'common'>) => (date: Dayjs, now: Dayjs) => {
  const seconds = Math.abs(now.diff(date, 'second'));
  if (seconds < 60) return t('time.compactNow');
  const minutes = Math.abs(now.diff(date, 'minute'));
  if (minutes < 60) return t('time.compactMinutesAgo', { count: minutes });
  const hours = Math.abs(now.diff(date, 'hour'));
  if (hours < 24) return t('time.compactHoursAgo', { count: hours });
  const days = Math.abs(now.diff(date, 'day'));
  if (days < 7) return t('time.compactDaysAgo', { count: days });
  const weeks = Math.abs(now.diff(date, 'week'));
  const months = Math.abs(now.diff(date, 'month'));
  if (months < 1) return t('time.compactWeeksAgo', { count: weeks });
  if (months < 12) return t('time.compactMonthsAgo', { count: months });
  return t('time.compactYearsAgo', { count: Math.abs(now.diff(date, 'year')) });
};

/**
 * Format a timestamp using the activity-feed convention: relative within
 * `relativeThresholdMs` (default 24h), absolute date afterwards. The format
 * strings are pulled from the `common` namespace so callers don't need to
 * wire up i18n themselves.
 */
export const useActivityTime = (
  time?: string | Date | number | null,
  options: UseActivityTimeOptions = {},
): FormattedActivityTime => {
  const { t } = useTranslation('common');
  const { compact, ...rest } = options;
  return formatActivityTime(time, {
    ...rest,
    ...(compact
      ? { formatRelative: compactRelative(t), relativeThresholdMs: Number.POSITIVE_INFINITY }
      : {}),
    formatOtherYear: t('time.formatOtherYear'),
    formatThisYear: t('time.formatThisYear'),
  });
};
