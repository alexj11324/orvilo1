import {
  formatActivityTime,
  type FormatActivityTimeOptions,
  type FormattedActivityTime,
} from '@orvilo/utils/time';
import { useTranslation } from 'react-i18next';

export type UseActivityTimeOptions = Omit<
  FormatActivityTimeOptions,
  'formatOtherYear' | 'formatThisYear'
>;

/**
 * The issue-detail feed follows Linear's convention: timestamps stay relative
 * ("23d ago") however far back they go — the absolute datetime still rides the
 * `title` tooltip. Other surfaces keep the 24h → absolute flip, so this is a
 * per-call preset, never the default.
 */
export const ALWAYS_RELATIVE: UseActivityTimeOptions = {
  relativeThresholdMs: Number.POSITIVE_INFINITY,
};

/**
 * Format a timestamp using the activity-feed convention: relative within
 * `relativeThresholdMs` (default 24h), absolute date afterwards. The format
 * strings are pulled from the `common` namespace so callers don't need to
 * wire up i18n themselves.
 */
export const useActivityTime = (
  time?: string | Date | number | null,
  options?: UseActivityTimeOptions,
): FormattedActivityTime => {
  const { t } = useTranslation('common');
  return formatActivityTime(time, {
    ...options,
    formatOtherYear: t('time.formatOtherYear'),
    formatThisYear: t('time.formatThisYear'),
  });
};
