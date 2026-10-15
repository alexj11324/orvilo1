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
import { finiteValue, radarPoint } from './math';
import type { RadarChartProps } from './types';

export function RadarChart({
  data,
  categories,
  index,
  colors,
  customCategories,
  customTooltip,
  angleAxisLabelFormatter,
  xAxisLabelFormatter,
  valueFormatter = String,
  height = 280,
  width = '100%',
  minValue = 0,
  maxValue = 100,
  showLegend = true,
  showTooltip = true,
  showGridLines = true,
  showRadiusAxis = false,
  shape = 'polygon',
  fillOpacity = 0.33,
  dimSecondarySeries = true,
  secondaryOpacity = 0.25,
  loading,
  noDataText,
  className,
  style,
  onValueChange,
  ...rest
}: RadarChartProps) {
  const [ref, measuredWidth] = useChartWidth();
  const defaults = useThemeColorRange();
  const palette = colors?.length ? colors : defaults;
  const [active, setActive] = useState<number>();
  const [selected, setSelected] = useState<string>();
  const numericHeight = typeof height === 'number' ? height : 280;
  const drawingHeight = Math.max(1, numericHeight - (showLegend ? 40 : 0));
  const size = Math.max(1, Math.min(measuredWidth, drawingHeight));
  const center = size / 2;
  const radius = Math.max(0, center - 40);
  const point = (position: number, fraction: number) =>
    radarPoint(position, data.length, radius * fraction, center);
  const activeRow = active === undefined ? undefined : data[active];
  const scale = (value: number) =>
    Math.max(0, Math.min(1, (value - minValue) / Math.max(Number.EPSILON, maxValue - minValue)));
  return (
    <div
      {...rest}
      className={cn('relative flex min-w-0 flex-col', className)}
      ref={ref}
      style={{ height, width, ...style }}
    >
      {loading || data.length === 0 ? (
        <ChartStatus loading={loading} noDataText={noDataText} />
      ) : (
        <>
          {showLegend && (
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
                      onValueChange(next ? { categoryClicked: next, eventType: 'category' } : null);
                    }
                  : undefined
              }
            />
          )}
          <svg
            aria-label={index}
            className="min-h-0 flex-1 w-full text-xs text-foreground-description focus-visible:outline-2 focus-visible:outline-ring"
            role="group"
            tabIndex={0}
            viewBox={`0 0 ${size} ${size}`}
            onBlur={() => setActive(undefined)}
            onPointerLeave={() => setActive(undefined)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                setActive(
                  (previous) =>
                    ((previous ?? 0) + (event.key === 'ArrowRight' ? 1 : data.length - 1)) %
                    data.length,
                );
              } else if (event.key === 'Escape') setActive(undefined);
            }}
            onPointerMove={(event) => {
              if (!showTooltip) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const factor = Math.min(rect.width, rect.height) / size;
              if (factor <= 0) return;
              const x = (event.clientX - rect.left - rect.width / 2) / factor;
              const y = (event.clientY - rect.top - rect.height / 2) / factor;
              if (Math.hypot(x, y) > radius + 32) {
                setActive(undefined);
                return;
              }
              const angle = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
              setActive(Math.round((angle / (2 * Math.PI)) * data.length) % data.length);
            }}
          >
            {showGridLines && (
              <g className="recharts-polar-grid" fill="none" stroke="var(--selected)">
                {[0.25, 0.5, 0.75, 1].map((fraction) =>
                  shape === 'circle' ? (
                    <circle cx={center} cy={center} key={fraction} r={radius * fraction} />
                  ) : (
                    <path
                      key={fraction}
                      d={`${data
                        .map((_, position) => {
                          const p = point(position, fraction);
                          return `${position ? 'L' : 'M'}${p.x},${p.y}`;
                        })
                        .join(' ')} Z`}
                    />
                  ),
                )}
                {data.map((_, position) => {
                  const p = point(position, 1);
                  return <line key={position} x1={center} x2={p.x} y1={center} y2={p.y} />;
                })}
              </g>
            )}
            {[...categories].reverse().map((category) => {
              const series = categories.indexOf(category);
              const scored = data.flatMap((row, position) => {
                const value = finiteValue(row[category]);
                if (value === undefined) return [];
                return [{ ...point(position, scale(value)), value }];
              });
              const secondary = dimSecondarySeries && series > 0 ? secondaryOpacity : 1;
              const inactive = selected && selected !== category ? 0.3 : 1;
              const color = seriesColor(palette, series);
              // Missing scores are omitted, never manufactured as zero-valued center vertices.
              return (
                <g
                  fill={color}
                  fillOpacity={fillOpacity * secondary * inactive}
                  key={category}
                  stroke={color}
                  strokeOpacity={secondary * inactive}
                  strokeWidth={2}
                >
                  {scored.length >= 3 ? (
                    <polygon points={scored.map((p) => `${p.x},${p.y}`).join(' ')} />
                  ) : (
                    <polyline fill="none" points={scored.map((p) => `${p.x},${p.y}`).join(' ')} />
                  )}
                  {scored.length === 1 && <circle cx={scored[0].x} cy={scored[0].y} r={2} />}
                </g>
              );
            })}
            {data.map((row, position) => {
              const p = radarPoint(position, data.length, radius + 16, center);
              const label = labelValue(row[index]);
              return (
                <text
                  className="recharts-polar-angle-axis-tick-value"
                  dominantBaseline="middle"
                  fill="currentColor"
                  key={position}
                  x={p.x}
                  y={p.y}
                  textAnchor={
                    Math.abs(p.x - center) < 1 ? 'middle' : p.x > center ? 'start' : 'end'
                  }
                  onPointerEnter={() => setActive(position)}
                >
                  {angleAxisLabelFormatter
                    ? angleAxisLabelFormatter(label, row)
                    : xAxisLabelFormatter
                      ? xAxisLabelFormatter(label)
                      : label}
                </text>
              );
            })}
            {showRadiusAxis &&
              [0.25, 0.5, 0.75, 1].map((fraction) => (
                <text
                  fill="currentColor"
                  key={fraction}
                  x={center + 4}
                  y={center - radius * fraction}
                >
                  {valueFormatter(minValue + (maxValue - minValue) * fraction)}
                </text>
              ))}
            {showTooltip &&
              data.map((row, position) => {
                const p = point(position, 1);
                return (
                  <circle
                    aria-hidden
                    cx={p.x}
                    cy={p.y}
                    fill="transparent"
                    key={position}
                    r={12}
                    onPointerEnter={() => setActive(position)}
                  />
                );
              })}
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
