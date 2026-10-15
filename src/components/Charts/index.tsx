'use client';

import { seriesColor, useThemeColorRange } from './common';

export { BarChart } from './bar';
export { ChartTooltipFrame, ChartTooltipRow, useThemeColorRange } from './common';
export { RadarChart } from './radar';
export type { BarChartProps, ChartTooltipProps, RadarChartProps } from './types';

export function CategoryBar({
  values,
  colors,
  size = 2,
  showLabels = true,
}: {
  colors?: readonly string[];
  showLabels?: boolean;
  size?: number;
  values: number[];
}) {
  const defaults = useThemeColorRange();
  const palette = colors?.length ? colors : defaults;
  const total = values.reduce(
    (sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0),
    0,
  );
  return (
    <div
      aria-label={values.map((value) => `${value * 100}%`).join(', ')}
      className="flex w-full overflow-hidden rounded-(--radius-chip)"
      role="group"
      style={{ minHeight: size * 4 }}
    >
      {values.map((value, index) =>
        Number.isFinite(value) && value > 0 && total > 0 ? (
          <span
            className="flex items-center justify-center text-xs"
            key={index}
            style={{
              backgroundColor: seriesColor(palette, index),
              width: `${(value / total) * 100}%`,
            }}
          >
            <span
              className={
                showLabels ? 'rounded-(--radius-chip) bg-card px-1 text-foreground' : 'sr-only'
              }
            >{`${value * 100}%`}</span>
          </span>
        ) : null,
      )}
    </div>
  );
}
