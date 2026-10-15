'use client';

import { cn } from 'cn';
import type { ReactNode, RefObject } from 'react';
import { isValidElement, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';

import { finiteValue } from './math';
import type { BaseChartProps, ChartDatum, ChartPayload, ChartTooltipProps } from './types';

// Consume the application's existing categorical roles; caller-provided colors retain precedence.
const RANGE = Array.from({ length: 16 }, (_, index) => `var(--chart-${(index % 5) + 1})`);
const getThemeColorRange = () => RANGE;
// Preserve the migrated callers' API while naming the stateless implementation accurately.
export { getThemeColorRange as useThemeColorRange };
export const seriesColor = (colors: readonly string[], index: number) =>
  colors[index % colors.length] ?? 'var(--chart-1)';
export const labelValue = (value: unknown): string | number =>
  typeof value === 'number' || typeof value === 'string' ? value : '';

export function useChartWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = element.clientWidth;
      if (next > 0) setWidth((previous) => (previous === next ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
export function ChartTooltipFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-(--radius-overlay) border border-divider bg-popover text-popover-foreground shadow-(--shadow-popover) text-xs">
      {children}
    </div>
  );
}
export function ChartTooltipRow({
  color,
  name,
  value,
}: {
  color?: string;
  name?: ReactNode;
  value?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        {name}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
export function ChartStatus({
  loading,
  noDataText,
}: Pick<BaseChartProps, 'loading' | 'noDataText'>) {
  const { t } = useTranslation('common');
  if (loading)
    return <Skeleton aria-busy="true" aria-label={t('loading')} className="h-full w-full" />;
  let content: ReactNode = t('noContent');
  if (noDataText !== undefined) {
    if (
      typeof noDataText === 'object' &&
      noDataText !== null &&
      !isValidElement(noDataText) &&
      !Array.isArray(noDataText)
    ) {
      const descriptor = noDataText as { title?: string; desc?: string };
      content = (
        <div className="text-center">
          <p>{descriptor.title}</p>
          <p className="text-xs">{descriptor.desc}</p>
        </div>
      );
    } else content = noDataText as ReactNode;
  }
  return (
    <div
      className="flex h-full items-center justify-center text-sm text-muted-foreground"
      role="status"
    >
      {content}
    </div>
  );
}
export function ChartDataTable({
  data,
  categories,
  index,
  customCategories,
  valueFormatter = String,
}: Pick<BaseChartProps, 'data' | 'categories' | 'index' | 'customCategories' | 'valueFormatter'>) {
  return (
    <table className="sr-only">
      <thead>
        <tr>
          <th>{index}</th>
          {categories.map((category) => (
            <th key={category}>{customCategories?.[category] ?? category}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, position) => (
          <tr key={position}>
            <th>{String(row[index] ?? '')}</th>
            {categories.map((category) => (
              <td key={category}>
                {finiteValue(row[category]) === undefined
                  ? '—'
                  : valueFormatter(row[category] as number)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function chartPayload(
  row: ChartDatum,
  categories: string[],
  colors: readonly string[],
  names?: Record<string, string>,
): ChartPayload[] {
  return categories.flatMap((category, index) => {
    const value = finiteValue(row[category]);
    return value === undefined
      ? []
      : [
          {
            color: seriesColor(colors, index),
            dataKey: category,
            name: names?.[category] ?? category,
            payload: row,
            value,
          },
        ];
  });
}
export function ChartTooltip({
  props,
  tooltip,
  formatter = String,
}: {
  formatter?: (value: number) => ReactNode;
  props: ChartTooltipProps;
  tooltip?: BaseChartProps['customTooltip'];
}) {
  if (!props.active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-4 top-4 z-10 flex justify-end"
      role="status"
    >
      {tooltip ? (
        tooltip(props)
      ) : (
        <ChartTooltipFrame>
          <div className="flex flex-col gap-1 p-3">
            <p>{props.label}</p>
            {props.payload?.map((row) => (
              <ChartTooltipRow
                color={row.color}
                key={row.dataKey}
                name={row.name}
                value={formatter(row.value)}
              />
            ))}
          </div>
        </ChartTooltipFrame>
      )}
    </div>
  );
}
export function ChartLegend({
  categories,
  colors,
  customCategories,
  selected,
  onSelect,
}: {
  categories: string[];
  colors: readonly string[];
  customCategories?: Record<string, string>;
  onSelect?: (category: string) => void;
  selected?: string;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 text-xs">
      {categories.map((category, index) => {
        const label = (
          <>
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: seriesColor(colors, index) }}
            />
            {customCategories?.[category] ?? category}
          </>
        );
        return onSelect ? (
          <button
            aria-pressed={selected === category}
            key={category}
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-(--radius-chip) focus-visible:outline-2 focus-visible:outline-ring',
              selected && selected !== category && 'opacity-40',
            )}
            onClick={() => onSelect(category)}
          >
            {label}
          </button>
        ) : (
          <span className="flex items-center gap-1" key={category}>
            {label}
          </span>
        );
      })}
    </div>
  );
}
