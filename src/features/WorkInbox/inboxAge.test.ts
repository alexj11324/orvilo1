import { describe, expect, it } from 'vitest';

import { formatInboxAge } from './inboxAge';

const now = new Date('2026-09-24T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const H = 3_600_000;
const D = 24 * H;

describe('formatInboxAge', () => {
  it("uses Linear's compact units", () => {
    expect(formatInboxAge(ago(14 * H), { now })).toBe('14h');
    expect(formatInboxAge(ago(3 * D), { now })).toBe('3d');
    expect(formatInboxAge(ago(15 * D), { now })).toBe('2w');
    expect(formatInboxAge(ago(62 * D), { now })).toBe('2mo');
    expect(formatInboxAge(ago(400 * D), { now })).toBe('1y');
    expect(formatInboxAge(ago(5 * 60_000), { now })).toBe('5m');
    expect(formatInboxAge(ago(10_000), { now })).toBe('now');
  });

  it('localizes the unit for zh', () => {
    expect(formatInboxAge(ago(14 * H), { locale: 'zh-CN', now })).toBe('14小时');
    expect(formatInboxAge(ago(3 * D), { locale: 'zh-CN', now })).toBe('3天');
    expect(formatInboxAge(ago(10_000), { locale: 'zh-CN', now })).toBe('刚刚');
  });

  it('never shows a fifth week and ignores bad input', () => {
    expect(formatInboxAge(ago(32 * D), { now })).toBe('1mo');
    expect(formatInboxAge('not a date', { now })).toBe('');
  });
});
