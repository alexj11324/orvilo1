'use client';

import { cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type BurnupIssue, projectIssueBurnupSeries } from '../projectIssueBurnup';

/**
 * The rail Progress card's burnup chart, hand-rolled because the repo ships
 * no chart dependency. Mirrors the reference's anatomy: three overlapping
 * under-line areas (scope over started over completed) with a 1.5px line on
 * each, three x-axis date labels, and a "today" marker at the right edge.
 */

const WIDTH = 360;
const CHART_HEIGHT = 120;
const LABEL_HEIGHT = 16;
const LINE_KEYS = ['scope', 'started', 'completed'] as const;

const seriesColor = {
  completed: cssVar.colorPrimary,
  scope: cssVar.colorTextTertiary,
  started: cssVar.colorWarning,
} as const;

const seriesOpacity = {
  completed: 0.16,
  scope: 0.1,
  started: 0.14,
} as const;

export const ProjectBurnupChart = memo<{ issues: readonly BurnupIssue[] }>(({ issues }) => {
  const { t } = useTranslation('project');
  const series = useMemo(() => projectIssueBurnupSeries(issues), [issues]);

  if (!series || series.length === 0) return null;

  const max = Math.max(1, ...series.map((point) => point.scope));
  const xOf = (index: number) => (series.length === 1 ? 0 : (index / (series.length - 1)) * WIDTH);
  const yOf = (value: number) => CHART_HEIGHT - (value / max) * CHART_HEIGHT;

  const linePoints = (key: (typeof LINE_KEYS)[number]) =>
    series.map((point, i) => `${xOf(i).toFixed(1)},${yOf(point[key]).toFixed(1)}`).join(' ');
  const areaPath = (key: (typeof LINE_KEYS)[number]) =>
    `M${xOf(0).toFixed(1)},${CHART_HEIGHT} ` +
    series.map((point, i) => `L${xOf(i).toFixed(1)},${yOf(point[key]).toFixed(1)}`).join(' ') +
    ` L${xOf(series.length - 1).toFixed(1)},${CHART_HEIGHT} Z`;

  // First, midpoint and final days — the reference labels only the axis ends
  // plus one interior date.
  const ticks = [
    { anchor: 'start' as const, date: series[0].date, x: 0 },
    {
      anchor: 'middle' as const,
      date: series[Math.floor((series.length - 1) / 2)].date,
      x: xOf(Math.floor((series.length - 1) / 2)),
    },
    { anchor: 'end' as const, date: series.at(-1)!.date, x: WIDTH },
  ];

  return (
    <svg
      aria-label={t('overview.progressBurnup')}
      role="img"
      style={{ display: 'block', height: 'auto', width: '100%' }}
      viewBox={`0 0 ${WIDTH} ${CHART_HEIGHT + LABEL_HEIGHT}`}
    >
      {LINE_KEYS.map((key) => (
        <path d={areaPath(key)} fill={seriesColor[key]} key={key} opacity={seriesOpacity[key]} />
      ))}
      {LINE_KEYS.map((key) => (
        <polyline
          fill="none"
          key={key}
          points={linePoints(key)}
          stroke={seriesColor[key]}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      ))}
      <rect
        aria-hidden
        fill={cssVar.colorTextTertiary}
        height={CHART_HEIGHT}
        opacity={0.5}
        width={1.5}
        x={WIDTH - 1.5}
        y={0}
      />
      {ticks.map((tick, i) => (
        <text
          fill={cssVar.colorTextTertiary}
          fontSize={10}
          key={i}
          textAnchor={tick.anchor}
          x={tick.x}
          y={CHART_HEIGHT + 12}
        >
          {dayjs(tick.date).format('MMM D')}
        </text>
      ))}
    </svg>
  );
});

ProjectBurnupChart.displayName = 'ProjectBurnupChart';
