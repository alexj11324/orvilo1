// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  isValidScheduleOccurrenceToken,
  latestScheduleOccurrence,
  scheduleOccurrenceToken,
} from './scheduleOccurrence';

const slot = (pattern: string, now: string, timezone = 'UTC', notBefore?: string) =>
  latestScheduleOccurrence({
    pattern,
    timezone,
    now: new Date(now),
    notBefore: notBefore ? new Date(notBefore) : null,
  })?.toISOString();

describe('schedule occurrence identity', () => {
  it('coalesces missed plans to one elapsed slot and keeps retries on that slot', () => {
    expect(slot('*/5 * * * *', '2026-05-02T00:47:29Z')).toBe('2026-05-02T00:45:00.000Z');
    expect(slot('*/5 * * * *', '2026-05-02T00:49:59Z')).toBe('2026-05-02T00:45:00.000Z');
    expect(slot('0 9 * * *', '2026-05-04T18:00:00Z', 'UTC', '2026-05-01T00:00:00Z')).toBe(
      '2026-05-04T09:00:00.000Z',
    );
    expect(
      slot('0 9 * * *', '2026-05-04T08:58:00Z', 'UTC', '2026-05-04T00:00:00Z'),
    ).toBeUndefined();
  });

  it('binds the UTC planned instant to the IANA timezone and configuration', () => {
    const input = {
      taskId: 'task-1',
      pattern: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      plannedAt: new Date('2026-05-04T01:00:00Z'),
    };
    expect(slot(input.pattern, '2026-05-04T01:04:00Z', input.timezone)).toBe(
      input.plannedAt.toISOString(),
    );
    const tickToken = scheduleOccurrenceToken(input);
    expect(
      isValidScheduleOccurrenceToken({
        ...input,
        tickToken,
        now: new Date('2026-05-04T01:04:00Z'),
      }),
    ).toBe(true);
    expect(isValidScheduleOccurrenceToken({ ...input, timezone: 'UTC', tickToken })).toBe(false);
    expect(
      isValidScheduleOccurrenceToken({
        ...input,
        tickToken,
        now: new Date('2026-05-04T00:59:00Z'),
      }),
    ).toBe(false);
    expect(
      isValidScheduleOccurrenceToken({
        ...input,
        tickToken,
        notBefore: new Date('2026-05-04T01:01:00Z'),
      }),
    ).toBe(false);
  });

  it('skips a nonexistent spring DST wall time', () => {
    expect(
      slot('30 2 * * *', '2026-03-08T08:00:00Z', 'America/New_York', '2026-03-08T00:00:00Z'),
    ).toBeUndefined();
    expect(slot('30 2 * * *', '2026-03-09T07:00:00Z', 'America/New_York')).toBe(
      '2026-03-09T06:30:00.000Z',
    );
  });

  it('distinguishes the two elapsed autumn DST slots with identical wall times', () => {
    const first = slot('30 1 * * *', '2026-11-01T05:40:00Z', 'America/New_York');
    const second = slot('30 1 * * *', '2026-11-01T06:40:00Z', 'America/New_York');
    expect(first).toBe('2026-11-01T05:30:00.000Z');
    expect(second).toBe('2026-11-01T06:30:00.000Z');
    expect(
      scheduleOccurrenceToken({
        taskId: 't',
        pattern: '30 1 * * *',
        timezone: 'America/New_York',
        plannedAt: new Date(first!),
      }),
    ).not.toBe(
      scheduleOccurrenceToken({
        taskId: 't',
        pattern: '30 1 * * *',
        timezone: 'America/New_York',
        plannedAt: new Date(second!),
      }),
    );
  });

  it('handles fractional-hour timezone offsets and half-hour DST shifts', () => {
    expect(slot('0 9 * * *', '2026-05-04T03:16:00Z', 'Asia/Kathmandu')).toBe(
      '2026-05-04T03:15:00.000Z',
    );
    expect(slot('45 1 * * *', '2026-04-04T15:20:00Z', 'Australia/Lord_Howe')).toBe(
      '2026-04-04T15:15:00.000Z',
    );
  });

  it('respects month/day restrictions and rejects invalid patterns or zones', () => {
    expect(slot('0 9 1 5 *', '2026-05-04T12:00:00Z')).toBe('2026-05-01T09:00:00.000Z');
    expect(slot('0 9 * * 1,3', '2026-05-07T12:00:00Z')).toBe('2026-05-06T09:00:00.000Z');
    expect(slot('61 9 * * *', '2026-05-04T12:00:00Z')).toBeUndefined();
    expect(slot('0 9 * * *', '2026-05-04T12:00:00Z', 'Not/AZone')).toBeUndefined();
  });
});
