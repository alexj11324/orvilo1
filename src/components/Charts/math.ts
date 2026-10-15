import type { ChartDatum } from './types';

export function finiteValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function seriesSegments(row: ChartDatum, categories: string[], stack: boolean) {
  let positive = 0,
    negative = 0;
  return categories.flatMap((category) => {
    const value = finiteValue(row[category]);
    if (value === undefined) return [];
    const start = stack ? (value >= 0 ? positive : negative) : 0;
    if (stack) {
      if (value >= 0) positive += value;
      else negative += value;
    }
    return [{ category, end: start + value, start, value }];
  });
}
export function barDomain(
  data: ChartDatum[],
  categories: string[],
  stack: boolean,
  minimum?: number,
  maximum?: number,
) {
  let low = 0,
    high = 0;
  for (const row of data)
    for (const segment of seriesSegments(row, categories, stack)) {
      low = Math.min(low, segment.start, segment.end);
      high = Math.max(high, segment.start, segment.end);
    }
  const min = minimum ?? low;
  const max = maximum ?? high;
  return max > min ? ([min, max] as const) : ([min, min + 1] as const);
}
export function radarPoint(index: number, count: number, radius: number, center: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, count);
  return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
}
