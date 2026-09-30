import { Select, Switch, Tabs, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import { CalendarDays, Clock, RefreshCw } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NumberField, NumberFieldGroup, NumberFieldInput } from '@/components/reui/number-field';

import {
  formatIntervalLabel,
  formatScheduleDescription,
  nextHeartbeatFiring,
  nextScheduleFiring,
} from '../AgentTasks/AgentTaskDetail/scheduler/helpers';
import SchedulerForm, {
  type SchedulerFormChange,
} from '../AgentTasks/AgentTaskDetail/scheduler/SchedulerForm';

type IntervalUnit = 'hours' | 'minutes';

const MIN_MINUTES = 10;
const DEFAULT_PATTERN = '0 9 * * *';

/** The pre-create trigger draft — persisted as schedule or heartbeat columns. */
export interface TriggerDraft {
  heartbeatInterval?: number | null;
  kind: 'heartbeat' | 'schedule';
  maxExecutions?: number | null;
  pattern?: string | null;
  timezone?: string | null;
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  fieldLabel: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  preview: css`
    padding-block: 12px;
    padding-inline: 14px;
    border-radius: 12px;
    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface AutomationTriggerDraftProps {
  /** Null → trigger editor collapsed ("manual only"). */
  draft: TriggerDraft | null;
  onChange: (draft: TriggerDraft | null) => void;
}

/**
 * Draft-mode mirror of `TaskScheduleConfig`'s popover: same enable Switch,
 * schedule/heartbeat tabs and next-run preview, but bound to local state
 * instead of a persisted task.
 */
const AutomationTriggerDraft = memo<AutomationTriggerDraftProps>(({ draft, onChange }) => {
  const { t } = useTranslation(['chat', 'automation']);
  const enabled = !!draft;
  const kind = draft?.kind ?? 'schedule';

  const [intervalValue, setIntervalValue] = useState<number>(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('hours');

  const heartbeatSeconds =
    kind === 'heartbeat'
      ? intervalUnit === 'hours'
        ? intervalValue * 3600
        : Math.max(MIN_MINUTES, intervalValue) * 60
      : null;

  const summary = useMemo(() => {
    if (!draft) return null;
    if (draft.kind === 'schedule' && draft.pattern) {
      return formatScheduleDescription(draft.pattern, t);
    }
    if (draft.kind === 'heartbeat' && heartbeatSeconds && heartbeatSeconds > 0) {
      return t('trigger.every', {
        interval: formatIntervalLabel(heartbeatSeconds, t),
        ns: 'automation',
      });
    }
    return null;
  }, [draft, heartbeatSeconds, t]);

  const nextRun = useMemo(() => {
    if (!draft) return null;
    if (draft.kind === 'schedule' && draft.pattern) {
      return nextScheduleFiring(draft.pattern, draft.timezone ?? null);
    }
    if (draft.kind === 'heartbeat' && heartbeatSeconds) {
      return nextHeartbeatFiring(null, heartbeatSeconds);
    }
    return null;
  }, [draft, heartbeatSeconds]);

  const setKind = useCallback(
    (next: string) => {
      const nextKind = next === 'heartbeat' ? 'heartbeat' : 'schedule';
      const heartbeatInterval =
        intervalUnit === 'hours' ? intervalValue * 3600 : intervalValue * 60;
      if (!draft) {
        onChange(
          nextKind === 'schedule'
            ? { kind: 'schedule', pattern: DEFAULT_PATTERN }
            : { heartbeatInterval, kind: 'heartbeat' },
        );
        return;
      }
      onChange({ ...draft, heartbeatInterval, kind: nextKind });
    },
    [draft, intervalUnit, intervalValue, onChange],
  );

  const handleScheduleChange = useCallback(
    (change: SchedulerFormChange) => {
      onChange({
        kind: 'schedule',
        maxExecutions: change.maxExecutions,
        pattern: change.pattern,
        timezone: change.timezone,
      });
    },
    [onChange],
  );

  const handleHeartbeatChange = useCallback(
    (seconds: number) => {
      if (!draft || draft.kind !== 'heartbeat') return;
      onChange({ ...draft, heartbeatInterval: seconds });
    },
    [draft, onChange],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex flex-col flex-1 gap-0.5">
          <Text weight={500}>{t('trigger.section', { ns: 'automation' })}</Text>
          <Text fontSize={12} type={'secondary'}>
            {summary ?? t('trigger.unconfigured', { ns: 'automation' })}
          </Text>
        </div>
        <Switch
          checked={enabled}
          onChange={(checked) =>
            onChange(
              checked
                ? { kind: 'schedule', pattern: DEFAULT_PATTERN, timezone: dayjs.tz.guess() }
                : null,
            )
          }
        />
      </div>

      {enabled && nextRun && (
        <div className={cx(styles.preview, 'flex items-center gap-2.5')}>
          <Clock color={cssVar.colorTextDescription} size={16} />
          <Text type={'secondary'}>{t('taskSchedule.nextRun', { ns: 'chat' })}</Text>
          <Text style={{ flex: 1, textAlign: 'right' }} weight={500}>
            {nextRun.toDate().toLocaleString()}
          </Text>
        </div>
      )}

      {enabled && (
        <>
          <Tabs
            activeKey={kind}
            items={[
              {
                key: 'schedule',
                label: (
                  <div className="flex items-center gap-1.5 justify-center">
                    <CalendarDays size={14} />
                    <span>{t('taskSchedule.schedulerTab', { ns: 'chat' })}</span>
                  </div>
                ),
              },
              {
                key: 'heartbeat',
                label: (
                  <div className="flex items-center gap-1.5 justify-center">
                    <RefreshCw size={14} />
                    <span>{t('taskSchedule.intervalTab', { ns: 'chat' })}</span>
                  </div>
                ),
              },
            ]}
            styles={{
              list: { display: 'flex', width: '100%' },
              tab: { flex: 1 },
            }}
            onChange={setKind}
          />
          {kind === 'schedule' ? (
            <SchedulerForm
              maxExecutions={draft?.maxExecutions ?? null}
              pattern={draft?.pattern ?? DEFAULT_PATTERN}
              timezone={draft?.timezone ?? dayjs.tz.guess()}
              onChange={handleScheduleChange}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Text className={styles.fieldLabel}>
                {t('taskSchedule.intervalLabel', { ns: 'chat' })}
              </Text>
              <div className="flex items-center gap-2">
                <Text type={'secondary'}>{t('taskSchedule.every', { ns: 'chat' })}</Text>
                <NumberField
                  min={intervalUnit === 'minutes' ? MIN_MINUTES : 1}
                  style={{ width: 100 }}
                  value={intervalValue}
                  onValueChange={(val) => {
                    const n = typeof val === 'number' ? val : Number(val);
                    if (Number.isNaN(n) || n <= 0) return;
                    setIntervalValue(n);
                    handleHeartbeatChange(intervalUnit === 'hours' ? n * 3600 : n * 60);
                  }}
                >
                  <NumberFieldGroup>
                    <NumberFieldInput />
                  </NumberFieldGroup>
                </NumberField>
                <Select
                  style={{ flex: 1 }}
                  value={intervalUnit}
                  variant={'filled'}
                  options={[
                    { label: t('taskSchedule.minutes', { ns: 'chat' }), value: 'minutes' },
                    { label: t('taskSchedule.hours', { ns: 'chat' }), value: 'hours' },
                  ]}
                  onChange={(u: IntervalUnit) => {
                    setIntervalUnit(u);
                    const seconds = u === 'hours' ? intervalValue * 3600 : intervalValue * 60;
                    handleHeartbeatChange(seconds);
                  }}
                />
                <Text type={'secondary'}>{t('taskSchedule.intervalSuffix', { ns: 'chat' })}</Text>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default AutomationTriggerDraft;
