import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { CalendarDays, Clock, RefreshCw } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NumberField, NumberFieldGroup, NumberFieldInput } from '@/components/reui/number-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  formatIntervalLabel,
  formatScheduleDescription,
  nextHeartbeatFiring,
  nextScheduleFiring,
  normalizeHeartbeatInterval,
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
  kind: 'event' | 'heartbeat' | 'schedule';
  maxExecutions?: number | null;
  pattern?: string | null;
  timezone?: string | null;
}

const styles = {
  fieldLabel: 'text-[12px] text-muted-foreground',
  preview: 'rounded-[12px] bg-(--ant-color-fill-quaternary) px-3.5 py-3',
};

interface AutomationTriggerDraftProps {
  disabled?: boolean;
  /** Null → trigger editor collapsed ("manual only"). */
  draft: TriggerDraft | null;
  onChange: (draft: TriggerDraft | null) => void;
}

/**
 * Draft-mode mirror of `TaskScheduleConfig`'s popover: same enable Switch,
 * schedule/heartbeat tabs and next-run preview, but bound to local state
 * instead of a persisted task.
 */
const AutomationTriggerDraft = memo<AutomationTriggerDraftProps>((props) => {
  const { draft, disabled, onChange } = props;
  const { t } = useTranslation(['chat', 'automation']);
  const enabled = !!draft;
  const kind = draft?.kind ?? 'schedule';

  const storedSeconds = draft?.heartbeatInterval ?? 3600;
  const defaultUnit = storedSeconds % 3600 === 0 ? 'hours' : 'minutes';
  const [selectedUnit, setSelectedUnit] = useState<IntervalUnit>();
  const intervalUnit = selectedUnit ?? defaultUnit;
  const intervalValue = storedSeconds / (intervalUnit === 'hours' ? 3600 : 60);
  const heartbeatSeconds = kind === 'heartbeat' ? storedSeconds : null;

  const summary = useMemo(() => {
    if (!draft) return null;
    if (draft.kind === 'event') return t('events.title', { ns: 'automation' });
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
      if (next === 'event') {
        onChange({ kind: 'event' });
        return;
      }
      const nextKind = next === 'heartbeat' ? 'heartbeat' : 'schedule';
      const heartbeatInterval = normalizeHeartbeatInterval(intervalValue, intervalUnit);
      if (!draft) {
        onChange(
          nextKind === 'schedule'
            ? { kind: 'schedule', pattern: DEFAULT_PATTERN, timezone: dayjs.tz.guess() }
            : { heartbeatInterval, kind: 'heartbeat' },
        );
        return;
      }
      onChange({
        ...draft,
        heartbeatInterval,
        kind: nextKind,
        pattern: draft.pattern ?? DEFAULT_PATTERN,
        timezone: draft.timezone ?? dayjs.tz.guess(),
      });
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
    <div className="flex flex-col gap-4" inert={disabled}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col flex-1 gap-0.5">
          <div className="font-medium">{t('trigger.section', { ns: 'automation' })}</div>
          <div className="text-[12px] text-muted-foreground">
            {summary ?? t('trigger.unconfigured', { ns: 'automation' })}
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? { kind: 'schedule', pattern: DEFAULT_PATTERN, timezone: dayjs.tz.guess() }
                : null,
            )
          }
        />
      </div>

      {enabled && nextRun && (
        <div className={cn(styles.preview, 'flex items-center gap-2.5')}>
          <Clock color={'var(--ant-color-text-description)'} size={16} />
          <div className="text-muted-foreground">{t('taskSchedule.nextRun', { ns: 'chat' })}</div>
          <div className="font-medium" style={{ flex: 1, textAlign: 'right' }}>
            {formatAbsoluteDateTime(nextRun.toDate())}
          </div>
        </div>
      )}

      {enabled && (
        <>
          <Tabs value={kind} onValueChange={setKind}>
            <TabsList className="flex w-full">
              <TabsTrigger className="flex-1" disabled={disabled} value="schedule">
                <div className="flex items-center gap-1.5 justify-center">
                  <CalendarDays size={14} />
                  <span>{t('taskSchedule.schedulerTab', { ns: 'chat' })}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger className="flex-1" disabled={disabled} value="heartbeat">
                <div className="flex items-center gap-1.5 justify-center">
                  <RefreshCw size={14} />
                  <span>{t('taskSchedule.intervalTab', { ns: 'chat' })}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger className="flex-1" disabled={disabled} value="event">
                {t('events.event', { ns: 'automation' })}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {kind === 'event' ? (
            <p className="text-sm text-muted-foreground">
              {t('create.eventDraftHint', { ns: 'automation' })}
            </p>
          ) : kind === 'schedule' ? (
            <SchedulerForm
              maxExecutions={draft?.maxExecutions ?? null}
              pattern={draft?.pattern ?? DEFAULT_PATTERN}
              timezone={draft?.timezone ?? dayjs.tz.guess()}
              onChange={handleScheduleChange}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className={cn(styles.fieldLabel)}>
                {t('taskSchedule.intervalLabel', { ns: 'chat' })}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-muted-foreground">
                  {t('taskSchedule.every', { ns: 'chat' })}
                </div>
                <NumberField
                  disabled={disabled}
                  min={intervalUnit === 'minutes' ? MIN_MINUTES : 1}
                  style={{ width: 100 }}
                  value={intervalValue}
                  onValueChange={(val) => {
                    const n = typeof val === 'number' ? val : Number(val);
                    if (Number.isNaN(n) || n <= 0) return;
                    handleHeartbeatChange(normalizeHeartbeatInterval(n, intervalUnit));
                  }}
                >
                  <NumberFieldGroup>
                    <NumberFieldInput />
                  </NumberFieldGroup>
                </NumberField>
                <Select
                  disabled={disabled}
                  value={intervalUnit}
                  items={[
                    { label: t('taskSchedule.minutes', { ns: 'chat' }), value: 'minutes' },
                    { label: t('taskSchedule.hours', { ns: 'chat' }), value: 'hours' },
                  ]}
                  onValueChange={(u) => {
                    if (!u) return;
                    const unit = u as IntervalUnit;
                    setSelectedUnit(unit);
                    const seconds = normalizeHeartbeatInterval(intervalValue, unit);
                    handleHeartbeatChange(seconds);
                  }}
                >
                  <SelectTrigger style={{ flex: 1 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">
                      {t('taskSchedule.minutes', { ns: 'chat' })}
                    </SelectItem>
                    <SelectItem value="hours">{t('taskSchedule.hours', { ns: 'chat' })}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-muted-foreground">
                  {t('taskSchedule.intervalSuffix', { ns: 'chat' })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default AutomationTriggerDraft;
