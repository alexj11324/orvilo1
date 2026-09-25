import type { ProjectDatePrecision } from '@orvilo/types';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { formatProjectDate } from './projectPlanningDate';

/**
 * `formatProjectDate` with the active locale's day patterns
 * (`time.formatThisYear` / `time.formatOtherYear`), so a day date reads
 * "Dec 1" / "12月1日" this year and carries the year otherwise.
 * The formatter is memoized on the locale + patterns.
 */
export const useProjectDateFormatter = () => {
  const { i18n, t } = useTranslation('common');
  const formatThisYear = t('time.formatThisYear');
  const formatOtherYear = t('time.formatOtherYear');
  const locale = i18n.language;

  return useCallback(
    (date: string | null | undefined, precision: ProjectDatePrecision = 'day') =>
      formatProjectDate(date, precision, { formatOtherYear, formatThisYear, locale }),
    [formatOtherYear, formatThisYear, locale],
  );
};
