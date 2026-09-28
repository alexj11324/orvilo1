import dayjs, { type Dayjs } from 'dayjs';

/**
 * Pure geometry for the `/projects` Timeline layout (ref-projects-timeline.png,
 * NEW-FINDINGS §4). Everything here is date→pixel math with no React — kept in
 * its own module so the bar-position contract is unit-testable and the surface
 * component stays a renderer.
 *
 * Conventions:
 * - The axis is a half-open `[start, end)` day range, both ends day-aligned.
 *   `end` is the first day *after* the last rendered month, so
 *   `end.diff(start, 'day')` is the exact day count.
 * - One fixed zoom (the reference's month scale). `pxPerDay` is constant, so
 *   month cells vary in width with their day count — same as the reference.
 * - Dates are interpreted in local time: `startDate`/`targetDate` arrive as
 *   `date` columns ('YYYY-MM-DD'), so there is no timezone ambiguity to carry.
 */

export const TIMELINE_DAY_WIDTH = 4;
export const TIMELINE_ROW_HEIGHT = 40;
export const TIMELINE_GROUP_ROW_HEIGHT = 32;
export const TIMELINE_LIST_WIDTH = 264;
export const TIMELINE_MONTH_ROW_HEIGHT = 26;
export const TIMELINE_WEEK_ROW_HEIGHT = 18;
/**
 * Width of the faint "set dates" hint bar for projects without dates, and the
 * stub shown for a project that carries only a `targetDate` (~1 month).
 */
export const TIMELINE_PLACEHOLDER_DAYS = 30;
/**
 * Diamonds closer than this collapse into one `+n` mark — the reference folds
 * neighbouring milestones the same way (`Gate D — Residual Disposition… +3`).
 */
export const TIMELINE_MILESTONE_CLUSTER_PX = 22;

export interface TimelineRange {
  /** Last day, exclusive — first day after the final rendered month. */
  end: Dayjs;
  /** First rendered day, month-aligned. */
  start: Dayjs;
}

export interface TimelineDateRow {
  startDate?: Date | null | string;
  targetDate?: Date | null | string;
}

export const timelineDay = (value: Date | null | string | undefined): Dayjs | null => {
  if (!value) return null;
  const day = dayjs(value);
  return day.isValid() ? day.startOf('day') : null;
};

/**
 * Axis range for the visible rows: covers every dated project AND today, with
 * a pad so no bar starts/ends flush with the viewport edge. With no dated
 * projects the range is a fixed window around today (the reference likewise
 * always keeps today on the axis).
 */
export const resolveTimelineRange = (
  rows: readonly TimelineDateRow[],
  now: Dayjs = dayjs(),
): TimelineRange => {
  const today = now.startOf('day');
  if (rows.length === 0) {
    return {
      end: today.add(10, 'month').endOf('month').add(1, 'day'),
      start: today.subtract(2, 'month').startOf('month'),
    };
  }
  let min = today;
  let max = today;
  for (const row of rows) {
    for (const value of [row.startDate, row.targetDate]) {
      const day = timelineDay(value);
      if (!day) continue;
      if (day.isBefore(min)) min = day;
      if (day.isAfter(max)) max = day;
    }
  }
  return {
    end: max.add(3, 'month').endOf('month').add(1, 'day'),
    start: min.subtract(1, 'month').startOf('month'),
  };
};

/** Monday-based index of `day()`: Mon=0 … Sun=6. */
const mondayIndex = (day: Dayjs) => (day.day() + 6) % 7;

/** The Monday of the week containing `day` (ISO week start, no plugin needed). */
export const weekStart = (day: Dayjs): Dayjs =>
  day.startOf('day').subtract(mondayIndex(day), 'day');

/**
 * ISO-8601 week number without pulling in dayjs' isoWeek plugin (initialize.ts
 * registers a fixed plugin set — a pure function keeps that file untouched).
 * Week 1 is the week containing Jan 4 / the first Thursday.
 */
export const isoWeekNumber = (day: Dayjs): number => {
  const thursday = weekStart(day).add(3, 'day');
  const week1Monday = weekStart(dayjs(new Date(thursday.year(), 0, 4)));
  return Math.round(thursday.diff(week1Monday, 'day') / 7) + 1;
};

export interface TimelineMonthCell {
  key: string;
  label: string;
  /** px from axis left edge. */
  offset: number;
  /** px — `daysInMonth * pxPerDay`, so widths vary like the reference's. */
  width: number;
}

export interface TimelineWeekCell {
  key: string;
  offset: number;
  /** ISO week number label. */
  week: number;
  width: number;
}

export interface TimelineAxis {
  /** px — null when today falls outside the range (cannot happen: range covers today). */
  months: TimelineMonthCell[];
  todayOffset: number | null;
  totalDays: number;
  /** px — the scrollable content width. */
  totalWidth: number;
  weeks: TimelineWeekCell[];
  /** Distinct years covered, for the Year jump control. */
  years: number[];
}

export const buildTimelineAxis = (
  range: TimelineRange,
  dayWidth: number = TIMELINE_DAY_WIDTH,
  now: Dayjs = dayjs(),
): TimelineAxis => {
  const totalDays = Math.max(1, range.end.diff(range.start, 'day'));

  const months: TimelineMonthCell[] = [];
  let cursor = range.start.startOf('month');
  while (cursor.isBefore(range.end)) {
    const next = cursor.add(1, 'month').startOf('month');
    const cellStart = cursor.isBefore(range.start) ? range.start : cursor;
    const cellEnd = next.isAfter(range.end) ? range.end : next;
    months.push({
      key: cursor.format('YYYY-MM'),
      label: cursor.format('MMM YYYY'),
      offset: cellStart.diff(range.start, 'day') * dayWidth,
      width: cellEnd.diff(cellStart, 'day') * dayWidth,
    });
    cursor = next;
  }

  const weeks: TimelineWeekCell[] = [];
  for (
    let monday = weekStart(range.start);
    monday.isBefore(range.end);
    monday = monday.add(7, 'day')
  ) {
    const next = monday.add(7, 'day');
    const cellStart = monday.isBefore(range.start) ? range.start : monday;
    const cellEnd = next.isAfter(range.end) ? range.end : next;
    weeks.push({
      key: monday.format('YYYY-MM-DD'),
      offset: cellStart.diff(range.start, 'day') * dayWidth,
      week: isoWeekNumber(monday),
      width: cellEnd.diff(cellStart, 'day') * dayWidth,
    });
  }

  const todayOffset =
    now.isBefore(range.start) || !now.isBefore(range.end)
      ? null
      : now.diff(range.start, 'day', true) * dayWidth;

  const years: number[] = [];
  for (let year = range.start.year(); year <= range.end.subtract(1, 'day').year(); year += 1) {
    years.push(year);
  }

  return { months, todayOffset, totalDays, totalWidth: totalDays * dayWidth, weeks, years };
};

/* --------------------------------- Bars ----------------------------------- */

export interface TimelineBarRect {
  /**
   * Which side fades toward open-ended time. `end`: only a start date, the
   * bar runs to the horizon; `start`: only a target date, a stub fades in.
   */
  fade?: 'end' | 'start';
  left: number;
  width: number;
}

const clampOffset = (offset: number, totalWidth: number) =>
  Math.min(Math.max(0, offset), totalWidth);

/**
 * Project dates → bar geometry. The inclusive `targetDate` renders through its
 * whole day, so the right edge is `target + 1d`. Inverted persisted dates
 * (hand-edited localStorage cannot reach the server, but defensive) render
 * sorted rather than collapsing to zero width.
 *
 * Single-bound projects are honest about the missing end:
 * - start-only → bar runs from the start to the axis horizon and fades out
 *   (the project is ongoing / unended — the one thing we actually know);
 * - target-only → a fixed stub ending at the target fades in (claiming a bar
 *   back to the axis start would invent months of history).
 */
export const timelineBarRect = (
  row: TimelineDateRow,
  range: TimelineRange,
  dayWidth: number = TIMELINE_DAY_WIDTH,
): TimelineBarRect | null => {
  const start = timelineDay(row.startDate);
  const target = timelineDay(row.targetDate);
  const totalWidth = Math.max(1, range.end.diff(range.start, 'day')) * dayWidth;
  const offset = (day: Dayjs) => clampOffset(day.diff(range.start, 'day') * dayWidth, totalWidth);

  if (start && target) {
    const [first, last] = start.isAfter(target) ? [target, start] : [start, target];
    const left = offset(first);
    const right = offset(last.add(1, 'day'));
    return { left, width: Math.max(dayWidth, right - left) };
  }
  if (start) {
    const left = offset(start);
    return { fade: 'end', left, width: Math.max(dayWidth, totalWidth - left) };
  }
  if (target) {
    const right = offset(target.add(1, 'day'));
    const width = Math.min(TIMELINE_PLACEHOLDER_DAYS * dayWidth, right);
    return { fade: 'start', left: right - width, width: Math.max(dayWidth, width) };
  }
  return null;
};

/**
 * Where the "set dates" hint bar sits for a project with neither date: centred
 * on today — the only honest position on a date axis for unscheduled work.
 * Returns null when today is outside the range.
 */
export const timelinePlaceholderRect = (
  range: TimelineRange,
  now: Dayjs = dayjs(),
  dayWidth: number = TIMELINE_DAY_WIDTH,
): { left: number; width: number } | null => {
  const totalWidth = Math.max(1, range.end.diff(range.start, 'day')) * dayWidth;
  const today = now.startOf('day');
  if (today.isBefore(range.start) || !today.isBefore(range.end)) return null;
  const width = TIMELINE_PLACEHOLDER_DAYS * dayWidth;
  const centre = today.diff(range.start, 'day') * dayWidth;
  return {
    left: Math.min(Math.max(0, centre - width / 2), Math.max(0, totalWidth - width)),
    width,
  };
};

/* ------------------------------- Milestones ------------------------------- */

export interface TimelineMilestoneMark {
  /** How many milestone dates folded into this mark (1 = a lone diamond). */
  count: number;
  /** Milestone names, for the hover tooltip. */
  names: string[];
  /** px from axis left edge — the first (earliest) date in the cluster. */
  offset: number;
}

/**
 * Dated milestones → diamond positions on the bar row. Undated milestones
 * carry no axis position and are skipped (the detail pane lists them). Marks
 * within `clusterPx` fold into one `+n` cluster anchored at the earliest date,
 * mirroring the reference's collapsed diamond.
 */
export const clusterTimelineMilestones = <T extends { date?: null | string; name: string }>(
  milestones: readonly T[] | null | undefined,
  range: TimelineRange,
  dayWidth: number = TIMELINE_DAY_WIDTH,
  clusterPx: number = TIMELINE_MILESTONE_CLUSTER_PX,
): TimelineMilestoneMark[] => {
  const totalWidth = Math.max(1, range.end.diff(range.start, 'day')) * dayWidth;
  const dated = (milestones ?? [])
    .map((milestone) => ({ date: timelineDay(milestone.date), name: milestone.name }))
    .filter((milestone): milestone is { date: Dayjs; name: string } => milestone.date !== null)
    .map((milestone) => ({
      name: milestone.name,
      offset: clampOffset(milestone.date.diff(range.start, 'day') * dayWidth, totalWidth),
    }))
    .sort((a, b) => a.offset - b.offset);

  const marks: TimelineMilestoneMark[] = [];
  for (const milestone of dated) {
    const last = marks.at(-1);
    if (last && milestone.offset - last.offset <= clusterPx) {
      last.count += 1;
      last.names.push(milestone.name);
    } else {
      marks.push({ count: 1, names: [milestone.name], offset: milestone.offset });
    }
  }
  return marks;
};
