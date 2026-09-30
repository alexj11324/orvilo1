import { Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { ClockIcon } from 'lucide-react';
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
  automationMode?: 'heartbeat' | 'schedule' | null;
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
      // Single-line row regardless of mode/content length — long primaries
      // (e.g. "Every Mon/Tue/Wed/Thu/Fri/Sat at HH:MM") used to wrap to two
      // lines and shift the rows below. Tooltip still surfaces the full text
      // plus timezone on hover, so no information is lost.
      return (
        <SimpleTooltip title={data?.tooltip}>
          <div className="flex items-center gap-2.5" style={FLEX_MIN_WIDTH_0}>
            <ClockIcon size={16} style={{ color: cssVar.colorTextDescription }} />
            <Text
              ellipsis
              style={FLEX_MIN_WIDTH_0}
              type={data ? undefined : 'secondary'}
              weight={data ? 500 : undefined}
            >
              {data?.primary ?? t('taskSchedule.tag.add')}
            </Text>
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
          <ClockIcon size={16} style={{ color: cssVar.colorTextDescription }} />
          <Text ellipsis fontSize={12} style={FLEX_MIN_WIDTH_0} type={'secondary'}>
            {data.primary}
          </Text>
        </div>
      </SimpleTooltip>
    );
  },
);

export default TaskTriggerTag;
