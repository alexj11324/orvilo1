import type { ProjectDatePrecision } from '@orvilo/types';
import dayjs from 'dayjs';

export const PROJECT_DATE_PRECISIONS = ['day', 'month', 'quarter', 'halfYear', 'year'] as const;
export type { ProjectDatePrecision };

export type ProjectDatePickerMode = 'date' | 'month' | 'quarter' | 'year';

/**
 * Map the project planning precision to the date picker input mode.
 * Half-year has no native picker mode, so it uses month input and retains
 * the half-year precision in the saved draft.
 */
export const getProjectDatePickerMode = (
  precision: ProjectDatePrecision,
): ProjectDatePickerMode => {
  if (precision === 'day') return 'date';
  if (precision === 'halfYear') return 'month';
  return precision;
};

/**
 * Format a planning date using the precision the user selected in the create
 * dialog. The stored date remains an ISO day so it can be compared and
 * validated without losing the selected period.
 */
export const formatProjectDate = (
  date: string | null | undefined,
  precision: ProjectDatePrecision = 'day',
) => {
  if (!date) return '';

  const value = dayjs(date);
  if (!value.isValid()) return '';

  switch (precision) {
    case 'month': {
      return value.format('MMM YYYY');
    }
    case 'quarter': {
      return `${value.format('YYYY')} Q${Math.ceil((value.month() + 1) / 3)}`;
    }
    case 'halfYear': {
      return `${value.format('YYYY')} H${value.month() < 6 ? 1 : 2}`;
    }
    case 'year': {
      return value.format('YYYY');
    }
    default: {
      return value.format('MMM D, YYYY');
    }
  }
};
