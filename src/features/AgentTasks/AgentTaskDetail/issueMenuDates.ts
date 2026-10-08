import { addDays, addHours, addMonths, addWeeks, format } from 'date-fns';

export const issueDueDatePreset = (preset: 'tomorrow' | 'weekEnd' | 'week', now = new Date()) =>
  format(
    preset === 'tomorrow'
      ? addDays(now, 1)
      : preset === 'week'
        ? addWeeks(now, 1)
        : addDays(now, (5 - now.getDay() + 7) % 7),
    'yyyy-MM-dd',
  );

export const issueReminderPreset = (
  preset: 'hour' | 'tomorrow' | 'week' | 'month',
  now = new Date(),
) => {
  if (preset === 'hour') return addHours(now, 1);
  const result =
    preset === 'tomorrow'
      ? addDays(now, 1)
      : preset === 'week'
        ? addWeeks(now, 1)
        : addMonths(now, 1);
  result.setHours(9, 0, 0, 0);
  return result;
};

/** The concrete date phrases advertised by the issue menu's search field. */
export const parseIssueMenuDate = (value: string, now = new Date()): Date | undefined => {
  const input = value.trim();
  const relative = /^(?:in\s+)?(\d+)\s*([hdw]|hours?|days?|weeks?|months?)$/i.exec(input);
  if (relative) {
    const count = Number(relative[1]);
    if (!Number.isSafeInteger(count) || count < 1) return undefined;
    const unit = relative[2].toLowerCase();
    const date = unit.startsWith('h')
      ? addHours(now, count)
      : unit.startsWith('w')
        ? addWeeks(now, count)
        : unit.startsWith('m')
          ? addMonths(now, count)
          : addDays(now, count);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const time = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(input);
  if (time) {
    let hour = Number(time[1]);
    const minute = Number(time[2] ?? 0);
    if (minute > 59 || (time[3] ? hour < 1 || hour > 12 : hour > 23)) return undefined;
    if (time[3]) hour = (hour % 12) + (time[3].toLowerCase() === 'pm' ? 12 : 0);
    const result = new Date(now);
    result.setHours(hour, minute, 0, 0);
    return result.getTime() <= now.getTime() ? addDays(result, 1) : result;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const result = new Date(`${input}T09:00:00`);
    return !Number.isNaN(result.getTime()) && format(result, 'yyyy-MM-dd') === input
      ? result
      : undefined;
  }
  const monthDay = /^([a-z]+)\s+(\d{1,2})$/i.exec(input);
  if (!monthDay) return undefined;
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthName = monthDay[1].toLowerCase();
  const month = months.findIndex((name) => name === monthName || name.slice(0, 3) === monthName);
  const day = Number(monthDay[2]);
  if (month === -1 || day < 1 || day > 31 || new Date(2000, month, day).getMonth() !== month)
    return undefined;
  // The Gregorian calendar's longest gap between leap years is eight years.
  for (let offset = 0; offset <= 8; offset++) {
    const result = new Date(now.getFullYear() + offset, month, day, 9);
    if (result.getMonth() === month && result.getTime() > now.getTime()) return result;
  }
  return undefined;
};
