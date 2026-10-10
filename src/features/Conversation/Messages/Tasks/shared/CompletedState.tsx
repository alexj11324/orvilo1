'use client';


import { type TaskDetail } from '@orvilo/types';
import type { LucideProps } from 'lucide-react';
import { Footprints, Timer, Wrench } from 'lucide-react';
import { type ComponentType, createElement, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';

import Markdown from '../../../Markdown';
import { formatCost, formatDuration } from './utils';

const styles = {
  collapseContent: 'px-0 py-2 text-[13px] leading-[1.6]',
  separator: 'size-[3px] rounded-[50%] bg-[var(--ant-color-text-quaternary)]',
};

export type CompletedStateVariant = 'detail' | 'compact';

interface CompletedStateProps {
  content?: string;
  expanded?: boolean;
  taskDetail: TaskDetail;
  variant?: CompletedStateVariant;
}

interface MetricItemProps {
  icon?: ComponentType<LucideProps>;
  label?: string;
  value: string | number;
}

export const MetricItem = memo<MetricItemProps>(({ icon, label, value }) => (
  <Badge
    className="bg-transparent border-transparent"
    style={{ color: 'var(--ant-color-text-description)', padding: 0 }}
    variant="secondary"
  >
    {icon && createElement(icon)}
    {value}
    {label}
  </Badge>
));

MetricItem.displayName = 'MetricItem';

interface MetricsRowProps {
  formattedCost?: string | null;
  formattedDuration?: string | null;
  totalSteps?: number;
  totalToolCalls?: number;
  variant: CompletedStateVariant;
}

const MetricsRow = memo<MetricsRowProps>(
  ({ formattedDuration, formattedCost, totalSteps, totalToolCalls, variant }) => {
    const { t } = useTranslation('chat');

    const metrics: Array<{ icon?: ComponentType<LucideProps>; label?: string; value: string | number }> = [];

    // Build metrics array in order
    if (totalSteps !== undefined && totalSteps > 0) {
      metrics.push({
        icon: Footprints,
        label: t('task.metrics.stepsShort'),
        value: totalSteps,
      });
    }

    if (totalToolCalls !== undefined && totalToolCalls > 0) {
      metrics.push({
        icon: Wrench,
        label: t('task.metrics.toolCallsShort'),
        value: totalToolCalls,
      });
    }

    if (formattedCost) {
      metrics.push({
        icon: undefined,
        value: formattedCost,
      });
    }

    if (variant === 'detail') {
      return (
        <div className="flex items-center gap-3 justify-between" style={{paddingBlock: '8px 0'}}>
          {/* Left: Duration */}
          <div className="flex items-center gap-3">
            {formattedDuration && <MetricItem icon={Timer} value={formattedDuration} />}
          </div>

          {/* Right: Steps, Tool Calls, Cost */}
          <div className="flex items-center gap-3">
            {metrics.map((metric, index) => (
              <MetricItem
                icon={metric.icon}
                key={index}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>
        </div>
      );
    }

    // Compact variant
    return (
      <div className="flex items-center gap-3 justify-between flex-wrap">
        {/* Left: Duration */}
        <div className="flex items-center gap-2">
          {formattedDuration && <MetricItem icon={Timer} value={formattedDuration} />}
        </div>

        {/* Right: Steps, Tool Calls, Cost */}
        <div className="flex items-center gap-3">
          {metrics.map((metric, index) => (
            <div className="flex items-center gap-3" key={index}>
              {index > 0 && <div className={styles.separator} />}
              <MetricItem icon={metric.icon} label={metric.label} value={metric.value} />
            </div>
          ))}
        </div>
      </div>
    );
  },
);

MetricsRow.displayName = 'MetricsRow';

const CompletedState = memo<CompletedStateProps>(
  ({ taskDetail, content, expanded = false, variant = 'detail' }) => {
    const { duration, totalToolCalls, totalSteps, totalCost } = taskDetail;

    // Format duration and cost using shared utilities
    const formattedDuration = useMemo(() => formatDuration(duration), [duration]);
    const formattedCost = useMemo(() => formatCost(totalCost), [totalCost]);

    const hasContent = content && content.trim().length > 0;
    const hasMetrics =
      formattedDuration ||
      (totalSteps !== undefined && totalSteps > 0) ||
      (totalToolCalls !== undefined && totalToolCalls > 0) ||
      formattedCost;

    // Detail variant: content first, then footer with metrics
    if (variant === 'detail') {
      return (
        <>
          {content && <Markdown>{content}</Markdown>}
          {hasMetrics && (
            <MetricsRow
              formattedCost={formattedCost ?? undefined}
              formattedDuration={formattedDuration ?? undefined}
              totalSteps={totalSteps}
              totalToolCalls={totalToolCalls}
              variant={variant}
            />
          )}
        </>
      );
    }

    // Compact variant: metrics first, then expandable content
    return (
      <>
        {hasContent && expanded && (
          <div className={styles.collapseContent}>
            <Markdown>{content}</Markdown>
          </div>
        )}
        {hasMetrics && (
          <MetricsRow
            formattedCost={formattedCost ?? undefined}
            formattedDuration={formattedDuration ?? undefined}
            totalSteps={totalSteps}
            totalToolCalls={totalToolCalls}
            variant={variant}
          />
        )}
      </>
    );
  },
);

CompletedState.displayName = 'CompletedState';

export default CompletedState;
