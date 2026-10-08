import type { TaskIssueRecurrenceCadence } from '@orvilo/types';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

const calendarDate = (value: string) => {
  const date = dayjs.utc(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !date.isValid() || date.format('YYYY-MM-DD') !== value)
    throw new Error('Invalid issue due date');
  return date;
};

/** Linear creates the next issue at00:01 on the day after the previous due date. */
export const issueRecurrenceCreationAt = (dueDate: string, timezone: string): Date => {
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  const nextDay = calendarDate(dueDate).add(1, 'day').format('YYYY-MM-DD');
  return dayjs.tz(`${nextDay}T00:01:00`, timezone).toDate();
};

/** Calendar arithmetic keeps month-end/leap-year anchors and never adds fixed UTC hours. */
export const advanceIssueDueDate = (
  firstDueDate: string,
  currentDueDate: string,
  cadence: TaskIssueRecurrenceCadence,
  interval: number,
): string => {
  if (!Number.isInteger(interval) || interval < 1)
    throw new Error('Recurrence interval must be positive');
  const current = calendarDate(currentDueDate);
  if (cadence === 'day' || cadence === 'week')
    return current.add(interval, cadence).format('YYYY-MM-DD');
  const first = calendarDate(firstDueDate);
  const next = current.date(1).add(interval, cadence);
  return next.date(Math.min(first.date(), next.daysInMonth())).format('YYYY-MM-DD');
};

/** Missed dates coalesce to one current occurrence, matching the existing schedule sweep. */
export const nextIssueRecurrenceDue = (input: {
  firstDueDate: string;
  currentDueDate: string;
  cadence: TaskIssueRecurrenceCadence;
  interval: number;
  timezone: string;
  now: Date;
}): string => {
  const today = calendarDate(dayjs(input.now).tz(input.timezone).format('YYYY-MM-DD'));
  const current = calendarDate(input.currentDueDate);
  const elapsed =
    input.cadence === 'week' ? today.diff(current, 'day') / 7 : today.diff(current, input.cadence);
  const steps = Math.max(1, Math.floor(elapsed / input.interval));
  let dueDate = advanceIssueDueDate(
    input.firstDueDate,
    input.currentDueDate,
    input.cadence,
    input.interval * steps,
  );
  while (issueRecurrenceCreationAt(dueDate, input.timezone) <= input.now) {
    dueDate = advanceIssueDueDate(input.firstDueDate, dueDate, input.cadence, input.interval);
  }
  return dueDate;
};
