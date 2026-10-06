import type { TaskAutomationMode } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { ClockIcon, RadioTowerIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  formatIntervalLabel,
  formatScheduleDescription,
  formatTimezoneName,
} from '@/features/AgentTasks/AgentTaskDetail/scheduler/helpers';

import { SimpleTooltip } from './SimpleTooltip';

interface TaskTriggerTagProps {
  automationMode?: TaskAutomationMode | null;
  heartbeatInterval?: number | null;
  mode?: 'inline' | 'tag';
  schedulePattern?: string | null;
  scheduleTimezone?: string | null;
}

const FLEX_MIN_WIDTH_0 = { minWidth: 0 };
const PILL_STYLE: CSSProperties = {
  alignItems: 'center',
  background: cssVar.colorBgContainer,
  border: `1px solid ${cssVar.colorBorderSecondary}`,
  borderRadius: 24,
  display: 'flex',
  gap: 4,
  height: 24,
  minWidth: 0,
  paddingInline: '4px 8px',
};

const TaskTriggerTag = memo<TaskTriggerTagProps>(
  ({ automationMode, heartbeatInterval, mode = 'tag', schedulePattern, scheduleTimezone }) => {
    const { t, i18n } = useTranslation('chat');
    const data = useMemo<
      | {
          primary: string;
          secondary?: string;
          tooltip: string;
        }
      | undefined
    >(() => {
      // automationMode is the source of truth — DB may carry stale fields from
      // a previous mode (e.g. a heartbeat task that was once on a schedule).
      if (automationMode === 'event') {
        const event = t('taskDetail.runTrigger.event');
        return { primary: event, tooltip: event };
      }

      if (automationMode === 'schedule' && schedulePattern) {
        const primary = formatScheduleDescription(schedulePattern, t);
        const tzName = scheduleTimezone
          ? formatTimezoneName(scheduleTimezone, i18n.language)
          : undefined;
        return {
          primary,
          secondary: tzName,
          tooltip: tzName ? `${primary} · ${tzName}` : primary,
        };
      }

      if (automationMode === 'heartbeat' && heartbeatInterval && heartbeatInterval > 0) {
        const every = t('taskSchedule.tag.every', {
          interval: formatIntervalLabel(heartbeatInterval, t),
        });
        return {
          primary: every,
          tooltip: t('taskSchedule.tag.heartbeat', { every }),
        };
      }

      return undefined;
    }, [automationMode, heartbeatInterval, schedulePattern, scheduleTimezone, t, i18n.language]);

    if (mode === 'inline') {
      // The property row already draws the clock in its label column. This is
      // only the value: 13px regular, placeholder when empty. Long primaries
      // stay on one line; the tooltip still has the full text and timezone.
      return (
        <SimpleTooltip title={data?.tooltip}>
          <div
            className="block truncate"
            style={{
              ...FLEX_MIN_WIDTH_0,
              color: data ? undefined : cssVar.colorTextPlaceholder,
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 1.4,
            }}
          >
            {data?.primary ?? t('taskSchedule.tag.add')}
          </div>
        </SimpleTooltip>
      );
    }

    if (!data) return null;

    // Pill height (24px) only fits one line — drop the timezone here; the
    // tooltip surfaces it on hover.
    return (
      <SimpleTooltip title={data.tooltip}>
        <div style={PILL_STYLE}>
          {automationMode === 'event' ? (
            <RadioTowerIcon size={16} style={{ color: cssVar.colorTextDescription }} />
          ) : (
            <ClockIcon size={16} style={{ color: cssVar.colorTextDescription }} />
          )}
          <div
            className="truncate block text-[12px] text-muted-foreground"
            style={FLEX_MIN_WIDTH_0}
          >
            {data.primary}
          </div>
        </div>
      </SimpleTooltip>
    );
  },
);

export default TaskTriggerTag;
