import { createHash } from 'node:crypto';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const LOOKBACK = 366 * 24 * HOUR;

interface Schedule {
  pattern: string;
  timezone?: string | null;
}

const fieldValues = (field: string, min: number, max: number): Set<number> | null => {
  const values = new Set<number>();
  for (const term of field.split(',')) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(term);
    if (!match) return null;
    const step = match[2] ? Number(match[2]) : 1;
    const [start, end] =
      match[1] === '*'
        ? [min, max]
        : match[1].includes('-')
          ? match[1].split('-').map(Number)
          : [Number(match[1]), match[2] ? max : Number(match[1])];
    if (step < 1 || start < min || end > max || start > end) return null;
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
};

const compileSchedule = ({ pattern, timezone }: Schedule) => {
  const fields = pattern.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = fieldValues(fields[0], 0, 59);
  const hour = fieldValues(fields[1], 0, 23);
  const day = fieldValues(fields[2], 1, 31);
  const month = fieldValues(fields[3], 1, 12);
  const weekday = fieldValues(fields[4], 0, 7);
  if (!minute || !hour || !day || !month || !weekday) return null;
  if (weekday.has(7)) weekday.add(0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    minute: 'numeric',
    month: 'numeric',
    timeZone: timezone || 'UTC',
    timeZoneName: 'longOffset',
    weekday: 'short',
  });
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const matches = (at: number, includeMinute = true) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(at)).map((p) => [p.type, p.value]),
    );
    const dayMatches = day.has(Number(parts.day));
    const weekdayMatches = weekday.has(weekdays.indexOf(parts.weekday));
    // Standard cron: restricted day-of-month and weekday fields are alternatives.
    const dateMatches =
      fields[2] === '*'
        ? weekdayMatches
        : fields[4] === '*'
          ? dayMatches
          : dayMatches || weekdayMatches;
    return (
      dateMatches &&
      month.has(Number(parts.month)) &&
      hour.has(Number(parts.hour)) &&
      (!includeMinute || minute.has(Number(parts.minute)))
    );
  };
  const offsetAt = (at: number) =>
    formatter.formatToParts(new Date(at)).find((p) => p.type === 'timeZoneName')?.value;
  return { matches, offsetAt };
};

/**
 * Missed-plan policy: coalesce to the latest elapsed slot, at most one per sweep.
 * Search UTC instants so a nonexistent spring wall time never runs; the two
 * repeated autumn instants are distinct slots. There is no future tolerance.
 * The one-year recovery horizon bounds work and never backfills older slots.
 */
export const latestScheduleOccurrence = (
  input: Schedule & { now?: Date; notBefore?: Date | null },
): Date | null => {
  try {
    const schedule = compileSchedule(input);
    if (!schedule) return null;
    const now = (input.now ?? new Date()).getTime();
    const minimum = Math.max(now - LOOKBACK, input.notBefore?.getTime() ?? -Infinity);
    if (!Number.isFinite(now) || Number.isNaN(minimum)) return null;
    for (let cursor = Math.floor(now / MINUTE) * MINUTE; cursor >= minimum;) {
      const hourStart = Math.floor(cursor / HOUR) * HOUR;
      // Inspect both ends because an IANA offset transition can occur within
      // a UTC hour (e.g. Lord Howe's half-hour DST shift).
      if (
        schedule.matches(cursor, false) ||
        schedule.matches(hourStart, false) ||
        schedule.offsetAt(cursor) !== schedule.offsetAt(hourStart)
      ) {
        for (
          let candidate = cursor;
          candidate >= Math.max(hourStart, minimum);
          candidate -= MINUTE
        ) {
          if (schedule.matches(candidate)) return new Date(candidate);
        }
      }
      cursor = hourStart - MINUTE;
    }
    return null;
  } catch {
    // Invalid timezone/pattern is an invalid configuration, not a global sweep failure.
    return null;
  }
};

export const scheduleOccurrenceToken = (
  input: Schedule & { plannedAt: Date; taskId: string },
): string => {
  const configHash = createHash('sha256')
    .update(JSON.stringify([input.pattern.trim().replaceAll(/\s+/g, ' '), input.timezone || 'UTC']))
    .digest('hex');
  return `task:${input.taskId}:schedule:${configHash}:at:${input.plannedAt.toISOString()}`;
};

/** Revalidate the plan represented by a queue message against current configuration. */
export const isValidScheduleOccurrenceToken = (
  input: Schedule & { now?: Date; notBefore?: Date | null; taskId: string; tickToken: string },
): boolean => {
  const plannedAt = new Date(input.tickToken.slice(input.tickToken.lastIndexOf(':at:') + 4));
  if (!Number.isFinite(plannedAt.getTime()) || plannedAt.getTime() % MINUTE !== 0) return false;
  if (plannedAt.getTime() > (input.now ?? new Date()).getTime()) return false;
  if (
    input.notBefore &&
    (!Number.isFinite(input.notBefore.getTime()) || plannedAt.getTime() < input.notBefore.getTime())
  )
    return false;
  try {
    return (
      scheduleOccurrenceToken({ ...input, plannedAt }) === input.tickToken &&
      Boolean(compileSchedule(input)?.matches(plannedAt.getTime()))
    );
  } catch {
    return false;
  }
};
