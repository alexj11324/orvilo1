import { describe, expect, it } from 'vitest';

import type {
  HoverGlyphSample,
  LayoutSample,
  OverflowSample,
  RowSample,
  RowScopeSample,
  TextSample,
} from './layoutRules';
import {
  checkCenteredInFullRow,
  checkClippedText,
  checkDateFormat,
  checkHoverGlyphs,
  checkSiblingEdges,
  checkTypeScale,
  evaluateLayoutRules,
  formatViolations,
  isVerticalStack,
} from './layoutRules';

// A 240px rail at x=100 with 30px rows stacked 2px apart.
const CONTAINER = { left: 100, width: 240 };

const row = (index: number, patch: Partial<RowSample> = {}): RowSample => ({
  bottom: index * 32 + 30,
  box: { left: 100, width: 240 },
  contentLeft: 108,
  outer: { left: 100, width: 240 },
  selector: `div.row-${index}`,
  top: index * 32,
  ...patch,
});

const scopeOf = (rows: RowSample[]): RowScopeSample => ({
  container: CONTAINER,
  rows,
  scope: 'div[data-testid=task-properties]',
});

const text = (patch: Partial<TextSample> = {}): TextSample => ({
  fontSize: 13,
  fontWeight: '500',
  selector: 'span',
  text: 'Backlog',
  ...patch,
});

const overflow = (patch: Partial<OverflowSample> = {}): OverflowSample => ({
  clientWidth: 200,
  scrollWidth: 200,
  selector: 'span.title',
  text: 'Assignee',
  textOverflow: 'clip',
  ...patch,
});

describe('sibling-edge', () => {
  it('passes rows that share a left edge and width', () => {
    expect(checkSiblingEdges(scopeOf([row(0), row(1), row(2), row(3)]))).toEqual([]);
  });

  it('tolerates sub-pixel drift within 1px', () => {
    const rows = [row(0), row(1, { box: { left: 100.6, width: 239.5 } }), row(2)];

    expect(checkSiblingEdges(scopeOf(rows))).toEqual([]);
  });

  it('reports the centred assignee row with its offset from the consensus', () => {
    // The running-task rail: the blocked picker shrinks the row to its content
    // and the trigger centres it.
    const rows = [row(0), row(1), row(2, { box: { left: 160, width: 120 } }), row(3)];

    const violations = checkSiblingEdges(scopeOf(rows));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      rule: 'sibling-edge',
      selector: 'div.row-2',
      severity: 'error',
    });
    expect(violations[0].detail).toBe('left +60px, width -120px vs siblings (left 100, width 240)');
  });

  it('breaks a two-row tie toward the container edge and the wider box', () => {
    const rows = [row(0, { box: { left: 160, width: 120 } }), row(1)];

    const violations = checkSiblingEdges(scopeOf(rows));

    expect(violations.map((violation) => violation.selector)).toEqual(['div.row-0']);
  });

  it('skips rows that share a line (a wrapped pill row is not a stack)', () => {
    const pills = [0, 1, 2].map((index) =>
      row(index, { bottom: 28, box: { left: 100 + index * 90, width: 80 + index * 7 }, top: 0 }),
    );

    expect(isVerticalStack(pills)).toBe(false);
    expect(checkSiblingEdges(scopeOf(pills))).toEqual([]);
  });

  it('treats touching rows as stacked', () => {
    expect(isVerticalStack([row(0), row(1, { top: 30 })])).toBe(true);
  });
});

describe('centered-in-full-row', () => {
  it('passes a full-width row whose content starts at its padding', () => {
    expect(checkCenteredInFullRow(scopeOf([row(0), row(1)]))).toEqual([]);
  });

  it('reports a full-width row whose content starts past a quarter of it', () => {
    const violations = checkCenteredInFullRow(scopeOf([row(0), row(1, { contentLeft: 170 })]));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'centered-in-full-row', selector: 'div.row-1' });
    expect(violations[0].detail).toBe('content starts 70px into a 240px row (29%, limit 25%)');
  });

  it('allows content exactly at the 25% limit', () => {
    expect(checkCenteredInFullRow(scopeOf([row(0, { contentLeft: 160 })]))).toEqual([]);
  });

  it('ignores rows narrower than 95% of the container', () => {
    const narrow = row(0, { contentLeft: 200, outer: { left: 100, width: 220 } });

    expect(checkCenteredInFullRow(scopeOf([narrow]))).toEqual([]);
  });

  it('ignores rows with no visible content', () => {
    expect(checkCenteredInFullRow(scopeOf([row(0, { contentLeft: null })]))).toEqual([]);
  });
});

describe('clipped-text', () => {
  it('passes text that fits', () => {
    expect(checkClippedText([overflow(), overflow({ scrollWidth: 201 })])).toEqual([]);
  });

  it('passes overflowing text that ends in an ellipsis', () => {
    expect(checkClippedText([overflow({ scrollWidth: 320, textOverflow: 'ellipsis' })])).toEqual(
      [],
    );
  });

  it('reports overflowing text cut without an ellipsis', () => {
    const violations = checkClippedText([overflow({ scrollWidth: 202 })]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'clipped-text', selector: 'span.title' });
    expect(violations[0].detail).toContain('scrollWidth 202 > clientWidth 200');
  });
});

describe('type-scale', () => {
  const samples = [
    text(),
    text({ text: 'High' }),
    text({ fontSize: 12, fontWeight: '400', text: 'Updated' }),
    text({ fontSize: 13.33, text: 'Odd' }),
  ];

  it('tallies a histogram, most frequent first, without judging when no set is given', () => {
    const { histogram, violations } = checkTypeScale(samples);

    expect(histogram).toEqual([
      { count: 2, example: 'Backlog', key: '13px/500' },
      { count: 1, example: 'Updated', key: '12px/400' },
      { count: 1, example: 'Odd', key: '13.3px/500' },
    ]);
    expect(violations).toEqual([]);
  });

  it('passes runs inside the allowed set', () => {
    expect(checkTypeScale(samples.slice(0, 3), ['13px/500', '12px/400']).violations).toEqual([]);
  });

  it('reports each run outside the allowed set as a warning', () => {
    const { violations } = checkTypeScale(samples, ['13px/500', '12px/400']);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'type-scale', severity: 'warning' });
    expect(violations[0].detail).toContain('13.3px/500 is outside the type scale');
  });
});

describe('date-format', () => {
  it('passes localized dates and non-date numbers', () => {
    const samples = [
      text({ text: 'Sep 25' }),
      text({ text: '2026/09/25' }),
      text({ text: 'ORV-2026-0925' }),
      text({ text: 'build 12026-09-251' }),
    ];

    expect(checkDateFormat(samples)).toEqual([]);
  });

  it('reports a raw ISO date', () => {
    const violations = checkDateFormat([text({ text: 'Due 2026-09-25' })]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'date-format', severity: 'error' });
    expect(violations[0].detail).toContain('2026-09-25');
  });

  it('reports the date inside an ISO timestamp', () => {
    const violations = checkDateFormat([text({ text: 'Started 2026-09-25T10:00:00Z' })]);

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('ISO date 2026-09-25 shown raw');
  });
});

describe('hover-glyph', () => {
  const glyph = (key: string, opacity = 1) => ({ key, opacity, visible: opacity > 0.01 });
  const sample = (before: HoverGlyphSample['before'], after: HoverGlyphSample['after']) => ({
    after,
    before,
    selector: 'button "Assignee"',
  });

  it('passes a glyph that stays, and one that appears on hover', () => {
    expect(
      checkHoverGlyphs([
        sample([glyph('0')], [glyph('0')]),
        sample([glyph('0')], [glyph('new-0'), glyph('0')]),
      ]),
    ).toEqual([]);
  });

  it('passes a glyph swapped for another', () => {
    expect(checkHoverGlyphs([sample([glyph('0')], [glyph('new-0')])])).toEqual([]);
  });

  it('reports a glyph that fades out on hover', () => {
    const violations = checkHoverGlyphs([
      sample([glyph('0'), glyph('1')], [glyph('0'), glyph('1', 0)]),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'hover-glyph', selector: 'button "Assignee"' });
    expect(violations[0].detail).toBe('visible svg 2 → 1 on hover; #1 opacity 1 → 0');
  });

  it('pairs glyphs by identity when hover inserts a new one before them', () => {
    const violations = checkHoverGlyphs([
      sample([glyph('0'), glyph('1')], [glyph('new-0'), glyph('0', 0), glyph('1', 0)]),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toBe(
      'visible svg 2 → 1 on hover; #0 opacity 1 → 0, #1 opacity 1 → 0',
    );
  });

  it('reports an unmounted glyph by key', () => {
    const violations = checkHoverGlyphs([sample([glyph('0')], [])]);

    expect(violations[0].detail).toBe('visible svg 1 → 0 on hover; #0 unmounted');
  });
});

describe('evaluateLayoutRules', () => {
  const sample: LayoutSample = {
    overflow: [overflow({ scrollWidth: 260 })],
    rowScopes: [scopeOf([row(0), row(1, { box: { left: 160, width: 120 }, contentLeft: 168 })])],
    texts: [text({ text: 'Created 2026-09-25' }), text({ fontSize: 20 })],
  };

  it('runs every static rule by default', () => {
    const { typeScale, violations } = evaluateLayoutRules(sample, {
      allowedTypeScale: ['13px/500'],
    });

    expect(violations.map((violation) => violation.rule).sort()).toEqual([
      'centered-in-full-row',
      'clipped-text',
      'date-format',
      'sibling-edge',
      'type-scale',
    ]);
    expect(typeScale.map((entry) => entry.key)).toEqual(['13px/500', '20px/500']);
  });

  it('runs only the requested rules', () => {
    const { violations } = evaluateLayoutRules(sample, { rules: ['date-format'] });

    expect(violations.map((violation) => violation.rule)).toEqual(['date-format']);
  });
});

describe('formatViolations', () => {
  it('says so when there is nothing to report', () => {
    expect(formatViolations([])).toBe('No layout-rule violations.');
  });

  it('lists each violation with its rule, selector and detail', () => {
    expect(
      formatViolations([
        { detail: 'left +60px', rule: 'sibling-edge', selector: 'div.row-2', severity: 'error' },
      ]),
    ).toBe('1 layout-rule violation(s):\n  [error] sibling-edge div.row-2\n      left +60px');
  });
});
