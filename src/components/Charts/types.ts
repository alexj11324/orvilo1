import type { HTMLAttributes, ReactNode } from 'react';

export type ChartDatum = Record<string, string | number | undefined>;
export interface ChartPayload {
  color: string;
  dataKey: string;
  name: string;
  payload: ChartDatum;
  value: number;
}
export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ChartPayload[];
}
export interface BaseChartProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  categories: string[];
  colors?: readonly string[];
  customCategories?: Record<string, string>;
  customTooltip?: (props: ChartTooltipProps) => ReactNode;
  data: ChartDatum[];
  height?: number | string;
  index: string;
  loading?: boolean;
  maxValue?: number;
  minValue?: number;
  noDataText?: ReactNode | { desc?: string; title?: string };
  onValueChange?: (
    value: {
      categoryClicked: string;
      eventType: 'bar' | 'category';
      [key: string]: string | number;
    } | null,
  ) => void;
  showGridLines?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  valueFormatter?: (value: number) => string | number;
  width?: number | string;
  xAxisLabelFormatter?: (value: string | number) => string | number;
}
export interface BarChartProps extends BaseChartProps {
  stack?: boolean;
}
export interface RadarChartProps extends BaseChartProps {
  angleAxisLabelFormatter?: (value: string | number, row?: ChartDatum) => ReactNode;
  dimSecondarySeries?: boolean;
  fillOpacity?: number;
  secondaryOpacity?: number;
  shape?: 'polygon' | 'circle';
  showRadiusAxis?: boolean;
}
