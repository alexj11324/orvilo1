import type { ProjectDatePrecision } from '@orvilo/types';
import {
  ABSOLUTE_DATE_FORMAT,
  formatActivityTime,
  type FormattedActivityTime,
} from '@orvilo/utils/time';
import dayjs, { type Dayjs } from 'dayjs';

export const PROJECT_DATE_PRECISIONS = ['day', 'month', 'quarter', 'halfYear', 'year'] as const;
export type { ProjectDatePrecision };

export type ProjectDatePickerMode = 'date' | 'month' | 'quarter' | 'halfYear' | 'year';

/**
 * Map the project planning precision to the date picker grid. Every precision
 * has its own grid (half-year renders the two-cell H1 / H2 grid).
 */
export const getProjectDatePickerMode = (
  precision: ProjectDatePrecision,
): ProjectDatePickerMode => {
  if (precision === 'day') return 'date';
  return precision;
};

/**
 * Snap a picked day to the first day of the period the precision selects
 * (month, quarter, half-year or year). Day precision keeps the day.
 */
export const snapProjectDateToPrecision = (date: Dayjs, precision: ProjectDatePrecision): Dayjs => {
  if (precision === 'day') return date;
  const span = { halfYear: 6, month: 1, quarter: 3, year: 12 }[precision];
  return date.date(1).month(Math.floor(date.month() / span) * span);
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

/**
 * Activity timestamp: relative within a day, then the numeric project day
 * (`2026/09/23`) for both this year and other years, so the activity feed
 * matches the comment cards and never shows a month name.
 */
export const formatProjectActivityTime = (
  time: string | Date | number | null | undefined,
  now?: Date | string | number,
): FormattedActivityTime =>
  formatActivityTime(time, {
    formatOtherYear: PROJECT_DAY_FORMAT,
    formatThisYear: PROJECT_DAY_FORMAT,
    now,
  });

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
