import { describe, expect, it, vi } from 'vitest';

import { describeRecent, previewSections } from './helpers';

const p = { pass: true };
const v = { pass: false };

describe('describeRecent', () => {
  // The surfaces used to grade this — 老毛病 / 还不稳 / 已养成. The counts are what actually
  // happened, and they are what a reader can act on.
  it('reports the outcome of each recent practice in order', () => {
    const t = vi.fn((key: string, options?: Record<string, unknown>) =>
      key === 'habit.recentTip.title' ? `title:${options?.count}:${options?.list}` : key,
    );

    expect(describeRecent([p, v, p], false, t)).toBe(
      'title:3:habit.recentTip.pass habit.recentTip.violation habit.recentTip.pass',
    );
  });

  it('says a rule has not been tested rather than reporting an empty history', () => {
    const t = vi.fn((key: string) => key);

    expect(describeRecent([], false, t)).toBe('habit.recentTip.none');
    expect(t).toHaveBeenCalledWith('habit.recentTip.none');
  });

  // A hand-taught rule with no practice yet is pending validation, not merely unused — the
  // distinction the taught flag exists to carry.
  it('tells a hand-taught rule apart from one with an empty history', () => {
    const t = vi.fn((key: string) => key);

    expect(describeRecent([], true, t)).toBe('habit.hint.taughtPending');
  });
});

describe('previewSections', () => {
  it('drops the rule section, which only restates the title the card already shows', () => {
    expect(
      previewSections([
        { body: '分离运行执行面与观测访问面', key: 'rule' },
        { body: '两个面的故障域不同', key: 'why' },
      ]).map((section) => section.key),
    ).toEqual(['why']);
  });

  it('never renders a labelled blank row', () => {
    expect(previewSections([{ body: '   ', key: 'why' }])).toEqual([]);
    expect(previewSections()).toEqual([]);
  });

  it('carries the label key so every surface names a section the same way', () => {
    expect(previewSections([{ body: '补齐文档后通过', key: 'how' }])).toEqual([
      { body: '补齐文档后通过', key: 'how', label: 'rules.section.how' },
    ]);
  });
});
