'use client';

import { cn } from 'cn';
import { useState } from 'react';

import {
  ChartDataTable,
  ChartLegend,
  chartPayload,
  ChartStatus,
  ChartTooltip,
  labelValue,
  seriesColor,
  useChartWidth,
  useThemeColorRange,
} from './common';
import { barDomain, seriesSegments } from './math';
import type { BarChartProps } from './types';

export function BarChart({
  data,
  categories,
  index,
  colors,
  customCategories,
  customTooltip,
  valueFormatter = String,
  xAxisLabelFormatter = String,
  height = 280,
  width = '100%',
  stack = false,
  loading,
  noDataText,
  minValue,
  maxValue,
  showGridLines = true,
  showLegend = true,
  showTooltip = true,
  showXAxis = true,
  showYAxis = true,
  className,
  style,
  onValueChange,
  ...rest
}: BarChartProps) {
  const [ref, measuredWidth] = useChartWidth();
  const defaults = useThemeColorRange();
  const palette = colors?.length ? colors : defaults;
  const [active, setActive] = useState<number>();
  const [selected, setSelected] = useState<string>();
  const plotWidth = Math.max(1, measuredWidth - (showYAxis ? 64 : 16) - 16);
  const numericHeight = typeof height === 'number' ? height : 280;
  const top = showLegend ? 48 : 16;
  const bottom = showXAxis ? 40 : 16;
  const plotHeight = Math.max(1, numericHeight - top - bottom);
  const left = showYAxis ? 64 : 16;
  const [minimum, maximum] = barDomain(data, categories, stack, minValue, maxValue);
  const y = (value: number) =>
    top + plotHeight - ((value - minimum) / (maximum - minimum)) * plotHeight;
  const bucket = plotWidth / Math.max(1, data.length);
  const visibleEvery = Math.max(
    1,
    Math.ceil(data.length / Math.max(1, Math.floor(plotWidth / 80))),
  );
  const activeRow = active === undefined ? undefined : data[active];
  return (
    <div
      {...rest}
      className={cn('relative min-w-0', className)}
      ref={ref}
      style={{ height, width, ...style }}
    >
      {loading || data.length === 0 ? (
        <ChartStatus loading={loading} noDataText={noDataText} />
      ) : (
        <>
          {showLegend && (
            <div className="absolute inset-x-0 top-0">
              <ChartLegend
                categories={categories}
                colors={palette}
                customCategories={customCategories}
                selected={selected}
                onSelect={
                  onValueChange
                    ? (category) => {
                        const next = selected === category ? undefined : category;
                        setSelected(next);
                        onValueChange(
                          next ? { categoryClicked: next, eventType: 'category' } : null,
                        );
                      }
                    : undefined
                }
              />
            </div>
          )}
          <svg
            aria-label={index}
            className="block h-full w-full overflow-visible text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            role="group"
            tabIndex={0}
            viewBox={`0 0 ${measuredWidth} ${numericHeight}`}
            onBlur={() => setActive(undefined)}
            onPointerLeave={() => setActive(undefined)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                setActive((previous) =>
                  Math.max(
                    0,
                    Math.min(
                      data.length - 1,
                      (previous ?? 0) + (event.key === 'ArrowRight' ? 1 : -1),
                    ),
                  ),
                );
              } else if (event.key === 'Escape') setActive(undefined);
            }}
            onPointerMove={(event) => {
              if (!showTooltip) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const point =
                ((event.clientX - rect.left) / Math.max(1, rect.width)) * measuredWidth - left;
              setActive(Math.max(0, Math.min(data.length - 1, Math.floor(point / bucket))));
            }}
          >
            {[0, 1, 2, 3, 4].map((tick) => {
              const value = minimum + ((maximum - minimum) * tick) / 4;
              return (
                <g key={tick}>
                  {showGridLines && (
                    <line
                      stroke="var(--divider)"
                      x1={left}
                      x2={left + plotWidth}
                      y1={y(value)}
                      y2={y(value)}
                    />
                  )}
                  {showYAxis && (
                    <text
                      dominantBaseline="middle"
                      fill="currentColor"
                      textAnchor="end"
                      x={left - 8}
                      y={y(value)}
                    >
                      {valueFormatter(value)}
                    </text>
                  )}
                </g>
              );
            })}
            {data.map((row, position) => (
              <g key={position}>
                {seriesSegments(row, categories, stack).map((segment) => {
                  const series = categories.indexOf(segment.category);
                  const totalWidth = bucket * 0.8;
                  const barWidth = stack ? totalWidth : totalWidth / Math.max(1, categories.length);
                  return (
                    <rect
                      fill={seriesColor(palette, series)}
                      height={Math.abs(y(segment.end) - y(segment.start))}
                      key={segment.category}
                      opacity={selected && selected !== segment.category ? 0.3 : 1}
                      width={Math.max(0, barWidth)}
                      x={left + position * bucket + bucket * 0.1 + (stack ? 0 : series * barWidth)}
                      y={Math.min(y(segment.start), y(segment.end))}
                      onClick={
                        onValueChange
                          ? () =>
                              onValueChange({
                                categoryClicked: segment.category,
                                eventType: 'bar',
                                [index]: labelValue(row[index]),
                                value: segment.value,
                              })
                          : undefined
                      }
                    >
                      <title>{`${labelValue(row[index])}: ${customCategories?.[segment.category] ?? segment.category}: ${valueFormatter(segment.value)}`}</title>
                    </rect>
                  );
                })}
                {showXAxis && (position % visibleEvery === 0 || position === data.length - 1) && (
                  <text
                    fill="currentColor"
                    textAnchor="middle"
                    x={left + (position + 0.5) * bucket}
                    y={top + plotHeight + 24}
                  >
                    {xAxisLabelFormatter(labelValue(row[index]))}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <ChartDataTable
            categories={categories}
            customCategories={customCategories}
            data={data}
            index={index}
            valueFormatter={valueFormatter}
          />
          {showTooltip && activeRow && (
            <ChartTooltip
              formatter={valueFormatter}
              tooltip={customTooltip}
              props={{
                active: true,
                label: labelValue(activeRow[index]),
                payload: chartPayload(activeRow, categories, palette, customCategories),
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
