import type { ProjectDatePrecision } from '@orvilo/types';
import { ABSOLUTE_DATE_FORMAT } from '@orvilo/utils/time';
import dayjs, { type Dayjs } from 'dayjs';

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

/** Numeric day format shared by every project date display (`2026/09/21`). */
export const PROJECT_DAY_FORMAT = ABSOLUTE_DATE_FORMAT;

/**
 * Format a day for display anywhere under Projects. Never uses month names,
 * so the output does not depend on the UI language.
 */
export const formatProjectDay = (date: string | Date | Dayjs | null | undefined) => {
  if (!date) return '';
  const value = dayjs(date);
  return value.isValid() ? value.format(PROJECT_DAY_FORMAT) : '';
};

const TYPED_DAY_PATTERN = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;

/**
 * Parse a day typed into the date input. Accepts `YYYY/MM/DD`, `YYYY-MM-DD`
 * and the unpadded `YYYY/M/D`; returns null for anything else, including
 * calendar-invalid days such as `2026/02/31`.
 */
export const parseTypedProjectDay = (input: string): Dayjs | null => {
  const match = TYPED_DAY_PATTERN.exec(input.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const value = dayjs(new Date(year, month - 1, day));
  if (value.year() !== year || value.month() !== month - 1 || value.date() !== day) return null;
  return value;
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
      return value.format('YYYY/MM');
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
      return value.format(PROJECT_DAY_FORMAT);
    }
  }
};
