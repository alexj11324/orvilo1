import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import {
  buildTimelineAxis,
  clusterTimelineMilestones,
  isoWeekNumber,
  resolveTimelineRange,
  TIMELINE_DAY_WIDTH,
  TIMELINE_PLACEHOLDER_DAYS,
  timelineBarRect,
  timelinePlaceholderRect,
  weekStart,
} from './timelineGeometry';

const at = (iso: string) => dayjs(iso);

describe('resolveTimelineRange', () => {
  const now = at('2026-09-23T15:00:00');

  it('falls back to a window around today when nothing is dated', () => {
    const range = resolveTimelineRange([{}, {}], now);
    expect(range.start.isBefore(now)).toBe(true);
    expect(range.end.isAfter(now)).toBe(true);
    expect(range.start.date()).toBe(1); // month-aligned
    expect(range.end.date()).toBe(1); // exclusive end lands on a month start
  });

  it('covers every project date plus today with padding', () => {
    const range = resolveTimelineRange(
      [{ startDate: '2026-03-10', targetDate: '2026-11-20' }, { startDate: '2026-06-01' }],
      now,
    );
    expect(range.start.isBefore(at('2026-03-01'))).toBe(true); // padded before March
    expect(range.end.isAfter(at('2026-11-30'))).toBe(true); // padded past November
    expect(range.start.isBefore(now)).toBe(true);
    expect(range.end.isAfter(now)).toBe(true);
  });
});

describe('buildTimelineAxis', () => {
  const now = at('2026-09-23T12:00:00');
  const range = { end: at('2026-12-01'), start: at('2026-09-01') };
  const axis = buildTimelineAxis(range, TIMELINE_DAY_WIDTH, now);

  it('sizes the axis to the full day count', () => {
    // Sep 30 + Oct 31 + Nov 30 = 91 days
    expect(axis.totalDays).toBe(91);
    expect(axis.totalWidth).toBe(91 * TIMELINE_DAY_WIDTH);
  });

  it('emits month cells that vary with their day count', () => {
    expect(axis.months.map((m) => m.label)).toEqual(['Sep 2026', 'Oct 2026', 'Nov 2026']);
    expect(axis.months[0]).toMatchObject({ offset: 0, width: 30 * TIMELINE_DAY_WIDTH });
    expect(axis.months[1].offset).toBe(30 * TIMELINE_DAY_WIDTH);
    expect(axis.months[1].width).toBe(31 * TIMELINE_DAY_WIDTH);
  });

  it('emits ISO week cells aligned to Mondays', () => {
    // 2026-09-01 is a Tuesday; the first cell covers the partial week W36.
    expect(axis.weeks[0].week).toBe(36);
    expect(axis.weeks[0].width).toBe(6 * TIMELINE_DAY_WIDTH); // Tue–Sun
    expect(axis.weeks[1].week).toBe(37);
    expect(axis.weeks[1].offset).toBe(6 * TIMELINE_DAY_WIDTH);
    expect(axis.weeks[1].width).toBe(7 * TIMELINE_DAY_WIDTH);
  });

  it('positions today inside the axis', () => {
    // Sep 23 12:00 → 22 full days + 0.5 of Sep 23
    expect(axis.todayOffset).toBeCloseTo(22.5 * TIMELINE_DAY_WIDTH, 5);
    expect(axis.years).toEqual([2026]);
  });
});

describe('isoWeekNumber / weekStart', () => {
  it('matches known ISO week boundaries', () => {
    // 2026-09-23 is a Wednesday in ISO week 39.
    expect(isoWeekNumber(at('2026-09-23'))).toBe(39);
    // 2025-12-29 (Mon) is ISO 2026-W01; 2026-01-04 (Sun) still W01; Jan 5 is W02.
    expect(isoWeekNumber(at('2025-12-29'))).toBe(1);
    expect(isoWeekNumber(at('2026-01-04'))).toBe(1);
    expect(isoWeekNumber(at('2026-01-05'))).toBe(2);
  });

  it('weekStart lands on Monday', () => {
    expect(weekStart(at('2026-09-23')).format('YYYY-MM-DD')).toBe('2026-09-21');
    expect(weekStart(at('2026-09-21')).format('YYYY-MM-DD')).toBe('2026-09-21'); // Monday stays
    expect(weekStart(at('2026-09-27')).format('YYYY-MM-DD')).toBe('2026-09-21'); // Sunday → same week
  });
});

describe('timelineBarRect', () => {
  const range = { end: at('2026-12-01'), start: at('2026-09-01') };

  it('positions a start→target bar with an inclusive right edge', () => {
    const rect = timelineBarRect(
      { startDate: '2026-09-10', targetDate: '2026-10-02' },
      range,
      TIMELINE_DAY_WIDTH,
    );
    // Sep 10 is 9 days after Sep 1; Oct 2 inclusive ends Oct 3 → 32 - 9 = 23 days.
    expect(rect).toEqual({ left: 9 * TIMELINE_DAY_WIDTH, width: 23 * TIMELINE_DAY_WIDTH });
  });

  it('renders a same-day project as a one-day bar', () => {
    const rect = timelineBarRect(
      { startDate: '2026-09-05', targetDate: '2026-09-05' },
      range,
      TIMELINE_DAY_WIDTH,
    );
    expect(rect).toEqual({ left: 4 * TIMELINE_DAY_WIDTH, width: TIMELINE_DAY_WIDTH });
  });

  it('extends a start-only bar to the horizon with a right fade', () => {
    const rect = timelineBarRect({ startDate: '2026-09-16' }, range, TIMELINE_DAY_WIDTH);
    expect(rect).toEqual({
      fade: 'end',
      left: 15 * TIMELINE_DAY_WIDTH,
      width: (91 - 15) * TIMELINE_DAY_WIDTH,
    });
  });

  it('renders a fixed stub fading into a target-only bar', () => {
    const rect = timelineBarRect({ targetDate: '2026-10-15' }, range, TIMELINE_DAY_WIDTH);
    // Oct 15 inclusive ends Oct 16 → day 45; stub = 30 days back.
    expect(rect).toEqual({
      fade: 'start',
      left: (45 - TIMELINE_PLACEHOLDER_DAYS) * TIMELINE_DAY_WIDTH,
      width: TIMELINE_PLACEHOLDER_DAYS * TIMELINE_DAY_WIDTH,
    });
  });

  it('returns null for a project with no dates', () => {
    expect(timelineBarRect({}, range, TIMELINE_DAY_WIDTH)).toBeNull();
    expect(
      timelineBarRect({ startDate: null, targetDate: undefined }, range, TIMELINE_DAY_WIDTH),
    ).toBeNull();
  });

  it('survives inverted persisted dates by sorting the bounds', () => {
    const rect = timelineBarRect(
      { startDate: '2026-10-10', targetDate: '2026-09-20' },
      range,
      TIMELINE_DAY_WIDTH,
    );
    // Sep 20 → Oct 11 exclusive: left = 19d, width = 21d.
    expect(rect).toEqual({ left: 19 * TIMELINE_DAY_WIDTH, width: 21 * TIMELINE_DAY_WIDTH });
  });

  it('clamps bars to the axis when dates fall outside the range', () => {
    const rect = timelineBarRect(
      { startDate: '2020-01-01', targetDate: '2030-01-01' },
      range,
      TIMELINE_DAY_WIDTH,
    );
    expect(rect?.left).toBe(0);
    expect(rect?.width).toBe(91 * TIMELINE_DAY_WIDTH);
  });
});

describe('timelinePlaceholderRect', () => {
  const range = { end: at('2026-12-01'), start: at('2026-09-01') };

  it('centers the unscheduled hint bar on today', () => {
    const rect = timelinePlaceholderRect(range, at('2026-09-23T09:00:00'), TIMELINE_DAY_WIDTH);
    // Today is day 22 → centre 88px; 30-day width centred → left 88 - 60.
    expect(rect).toEqual({
      left: (22 - TIMELINE_PLACEHOLDER_DAYS / 2) * TIMELINE_DAY_WIDTH,
      width: TIMELINE_PLACEHOLDER_DAYS * TIMELINE_DAY_WIDTH,
    });
  });

  it('returns null when today is outside the range', () => {
    expect(timelinePlaceholderRect(range, at('2030-01-01'), TIMELINE_DAY_WIDTH)).toBeNull();
  });
});

describe('clusterTimelineMilestones', () => {
  const range = { end: at('2026-12-01'), start: at('2026-09-01') };

  it('places dated milestones at their day offset, sorted', () => {
    const marks = clusterTimelineMilestones(
      [
        { date: '2026-10-10', name: 'beta' },
        { date: '2026-09-05', name: 'alpha' },
      ],
      range,
      TIMELINE_DAY_WIDTH,
      0, // no clustering
    );
    expect(marks).toEqual([
      { count: 1, names: ['alpha'], offset: 4 * TIMELINE_DAY_WIDTH },
      { count: 1, names: ['beta'], offset: 39 * TIMELINE_DAY_WIDTH },
    ]);
  });

  it('folds close milestones into one +n mark anchored at the earliest date', () => {
    const marks = clusterTimelineMilestones(
      [
        { date: '2026-09-05', name: 'a' },
        { date: '2026-09-06', name: 'b' },
        { date: '2026-09-07', name: 'c' },
        { date: '2026-11-01', name: 'far' },
      ],
      range,
      TIMELINE_DAY_WIDTH,
      22,
    );
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({ count: 3, names: ['a', 'b', 'c'], offset: 16 });
    expect(marks[1]).toMatchObject({ count: 1, names: ['far'] });
  });

  it('skips undated milestones and tolerates missing input', () => {
    expect(
      clusterTimelineMilestones(
        [
          { date: null, name: 'undated' },
          { name: 'no field' },
          { date: '2026-09-05', name: 'dated' },
        ],
        range,
      ),
    ).toEqual([{ count: 1, names: ['dated'], offset: 16 }]);
    expect(clusterTimelineMilestones(undefined, range)).toEqual([]);
    expect(clusterTimelineMilestones(null, range)).toEqual([]);
  });
});
