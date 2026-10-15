import { describe, expect, it } from 'vitest';

import { barDomain, finiteValue, radarPoint, seriesSegments } from './math';

describe('local chart data geometry', () => {
  it('preserves exact series values and separates positive and negative stacks', () => {
    expect(seriesSegments({ a: 0.123456, b: 2, c: -3, d: -4 }, ['a', 'b', 'c', 'd'], true)).toEqual(
      [
        { category: 'a', start: 0, end: 0.123456, value: 0.123456 },
        { category: 'b', start: 0.123456, end: 2.123456, value: 2 },
        { category: 'c', start: 0, end: -3, value: -3 },
        { category: 'd', start: -3, end: -7, value: -4 },
      ],
    );
  });
  it('does not manufacture missing, invalid or string scores as zero', () => {
    expect(
      seriesSegments({ a: undefined, b: NaN, c: '42', d: 0 }, ['a', 'b', 'c', 'd'], false),
    ).toEqual([{ category: 'd', start: 0, end: 0, value: 0 }]);
    expect(finiteValue(Infinity)).toBeUndefined();
  });
  it('retains explicit radar score domain and extends bar bounds across stacked values', () => {
    expect(
      barDomain(
        [
          { a: 3, b: 4 },
          { a: -2, b: -5 },
        ],
        ['a', 'b'],
        true,
      ),
    ).toEqual([-7, 7]);
    expect(barDomain([{ a: 3 }], ['a'], false, 0, 100)).toEqual([0, 100]);
    expect(barDomain([], [], false)).toEqual([0, 1]);
  });
  it('starts radar dimensions at the top and proceeds clockwise', () => {
    expect(radarPoint(0, 4, 50, 100).x).toBeCloseTo(100);
    expect(radarPoint(0, 4, 50, 100).y).toBeCloseTo(50);
    expect(radarPoint(1, 4, 50, 100).x).toBeCloseTo(150);
    expect(radarPoint(1, 4, 50, 100).y).toBeCloseTo(100);
  });
});
