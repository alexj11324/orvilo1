import { cn } from 'cn';
import dayjs, { type Dayjs } from 'dayjs';
import { Globe, Hash, SlidersHorizontal } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import InputNumber from '@/components/InputNumber';
import Select from '@/components/Select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import {
  buildCronPattern,
  parseCronPattern,
  SCHEDULE_TYPE_OPTIONS,
  type ScheduleType,
  TIMEZONE_OPTIONS,
  type TimezoneOption,
  WEEKDAYS,
} from './CronConfig';

const styles = {
  fieldLabel: 'text-xs leading-5 text-muted-foreground',
  timezoneOffset: 'shrink-0 ms-3 text-xs leading-5 text-foreground-description',
  timezoneOption: 'flex gap-3 items-center justify-between min-w-0 text-sm leading-5.5',
  weekdayButton: 'w-9 px-0',
  weekdayButtonActive: 'text-primary-text bg-selected hover:text-primary-text hover:bg-selected',
};

const DEFAULT_PATTERN = '0 9 * * *';
const DEFAULT_TIMEZONE = 'UTC';

// Cron storage rounds minutes to 0 or 30 (see buildCronPattern), so the picker
// only needs to offer half-hour slots — flatten to a single column instead of
// antd's hour×minute grid.
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? 0 : 30;
  const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { label, value: hour * 60 + minute };
});

export interface SchedulerFormChange {
  maxExecutions: number | null;
  pattern: string;
  timezone: string;
}

interface SchedulerFormProps {
  maxExecutions?: number | null;
  onChange: (change: SchedulerFormChange) => void;
  pattern?: string | null;
  timezone?: string | null;
}

const SchedulerForm = memo<SchedulerFormProps>(({ maxExecutions, onChange, pattern, timezone }) => {
  const { t } = useTranslation('chat');

  // Local state seeded once from props at mount; never re-synced. Keeps the
  // form in user control even if an unrelated detail refresh runs concurrently.
  // Parent should `key={taskId}` this component to remount cleanly across tasks.
  const [initial] = useState(() => {
    const parsed = parseCronPattern(pattern || DEFAULT_PATTERN);
    return {
      ...parsed,
      triggerTime: dayjs().hour(parsed.triggerHour).minute(parsed.triggerMinute),
    };
  });

  const [scheduleType, setScheduleType] = useState<ScheduleType>(initial.scheduleType);
  const [triggerTime, setTriggerTime] = useState<Dayjs>(initial.triggerTime);
  const [hourlyInterval, setHourlyInterval] = useState<number>(initial.hourlyInterval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(
    initial.weekdays ?? (initial.scheduleType === 'weekly' ? [1, 2, 3, 4, 5] : []),
  );
  const [tz, setTz] = useState<string>(timezone || DEFAULT_TIMEZONE);
  const [maxExec, setMaxExec] = useState<number | null>(maxExecutions ?? null);
  const [continuous, setContinuous] = useState<boolean>(
    maxExecutions === null || maxExecutions === undefined,
  );

  const emit = useCallback(
    (
      overrides: Partial<{
        hourlyInterval: number;
        maxExec: number | null;
        scheduleType: ScheduleType;
        triggerTime: Dayjs;
        tz: string;
        weekdays: number[];
      }>,
    ) => {
      // When the user is mid-editing maxExec (cleared the input but hasn't
      // typed yet), local maxExec is null but `continuous` is still false.
      // Falling back to the persisted prop here avoids emitting null for an
      // unrelated field change — which would otherwise flip Continuous on.
      const fallbackMaxExec = continuous ? null : (maxExec ?? maxExecutions ?? null);
      const next = {
        hourlyInterval: overrides.hourlyInterval ?? hourlyInterval,
        maxExec: overrides.maxExec === undefined ? fallbackMaxExec : overrides.maxExec,
        scheduleType: overrides.scheduleType ?? scheduleType,
        triggerTime: overrides.triggerTime ?? triggerTime,
        tz: overrides.tz ?? tz,
        weekdays: overrides.weekdays ?? weekdays,
      };
      const nextPattern = buildCronPattern(
        next.scheduleType,
        next.triggerTime,
        next.hourlyInterval,
        next.weekdays,
      );
      onChange({ maxExecutions: next.maxExec, pattern: nextPattern, timezone: next.tz });
    },
    [
      continuous,
      hourlyInterval,
      maxExec,
      maxExecutions,
      onChange,
      scheduleType,
      triggerTime,
      tz,
      weekdays,
    ],
  );

  const handleScheduleTypeChange = (value: ScheduleType) => {
    const nextWeekdays = value === 'weekly' ? (weekdays.length ? weekdays : [1, 2, 3, 4, 5]) : [];
    setScheduleType(value);
    setWeekdays(nextWeekdays);
    emit({ scheduleType: value, weekdays: nextWeekdays });
  };

  const handleTimeChange = (totalMinutes: number) => {
    const next = dayjs()
      .hour(Math.floor(totalMinutes / 60))
      .minute(totalMinutes % 60);
    setTriggerTime(next);
    emit({ triggerTime: next });
  };

  const handleHourlyMinuteChange = (minute: number) => {
    const next = dayjs().hour(0).minute(minute);
    setTriggerTime(next);
    emit({ triggerTime: next });
  };

  const handleHourlyIntervalChange = (value: number | string | null) => {
    const next = typeof value === 'number' && value > 0 ? value : 1;
    setHourlyInterval(next);
    emit({ hourlyInterval: next });
  };

  const toggleWeekday = (day: number) => {
    const next = weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day];
    setWeekdays(next);
    emit({ weekdays: next });
  };

  const handleTimezoneChange = (value: string) => {
    setTz(value);
    emit({ tz: value });
  };

  const handleMaxExecChange = (value: number | string | null) => {
    if (typeof value === 'number' && value > 0) {
      setMaxExec(value);
      emit({ maxExec: value });
      return;
    }
    // Mid-edit clear (e.g. user is replacing 100 with 5): keep the field
    // empty locally but don't toggle Continuous or emit a null upstream.
    setMaxExec(null);
  };

  const handleContinuousChange = (checked: boolean) => {
    setContinuous(checked);
    if (checked) {
      emit({ maxExec: null });
    } else {
      const next = maxExec ?? 100;
      setMaxExec(next);
      emit({ maxExec: next });
    }
  };

  const showTimeRow = scheduleType !== 'hourly';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className={cn(styles.fieldLabel)}>{t('taskSchedule.frequency')}</div>
          <Select
            size="normal"
            value={scheduleType}
            options={SCHEDULE_TYPE_OPTIONS.map((opt) => ({
              label: t(opt.label as any),
              value: opt.value,
            }))}
            onChange={(value) => handleScheduleTypeChange(value as ScheduleType)}
          />
        </div>
        {showTimeRow && (
          <div className="flex flex-1 flex-col gap-1.5">
            <div className={cn(styles.fieldLabel)}>{t('taskSchedule.time')}</div>
            <Select
              options={TIME_OPTIONS}
              size="normal"
              value={triggerTime.hour() * 60 + triggerTime.minute()}
              onChange={(value) => handleTimeChange(value as number)}
            />
          </div>
        )}
        {scheduleType === 'hourly' && (
          <div className="flex flex-1 flex-col gap-1.5">
            <div className={cn(styles.fieldLabel)}>{t('taskSchedule.every')}</div>
            <div className="flex items-center gap-1.5">
              <InputNumber
                className="flex-1"
                max={24}
                min={1}
                size="normal"
                value={hourlyInterval}
                onChange={handleHourlyIntervalChange}
              />
              <div className="text-muted-foreground">{t('taskSchedule.hours')}</div>
              <Select
                className="w-20"
                size="normal"
                value={triggerTime.minute()}
                options={[
                  { label: ':00', value: 0 },
                  { label: ':15', value: 15 },
                  { label: ':30', value: 30 },
                  { label: ':45', value: 45 },
                ]}
                onChange={(value) => handleHourlyMinuteChange(value as number)}
              />
            </div>
          </div>
        )}
      </div>

      {scheduleType === 'weekly' && (
        <div className="flex flex-col gap-1.5">
          <div className={cn(styles.fieldLabel)}>{t('taskSchedule.weekday')}</div>
          <div className="flex gap-1.5">
            {WEEKDAYS.map(({ key, label }) => (
              <Button
                key={key}
                size="normal"
                type="button"
                variant="ghost"
                className={cn(
                  styles.weekdayButton,
                  weekdays.includes(key) && styles.weekdayButtonActive,
                )}
                onClick={() => toggleWeekday(key)}
              >
                {t(label as any)}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Accordion defaultValue={[]}>
        <AccordionItem className="border-b-0" value="advanced">
          <AccordionTrigger className="py-1.5 px-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-3.5 text-foreground-description" size={14} />
              <div className="text-muted-foreground">{t('taskSchedule.advancedSettings')}</div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3.5 pbs-2 pbe-1">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Globe className="size-3.5 text-foreground-description" size={14} />
                  <div className={cn(styles.fieldLabel)}>{t('taskSchedule.timezone')}</div>
                </div>
                <Select
                  showSearch
                  options={TIMEZONE_OPTIONS}
                  size="normal"
                  value={tz}
                  optionRender={(option) => {
                    const data = option as TimezoneOption;
                    return (
                      <div className={styles.timezoneOption}>
                        <span className="overflow-hidden text-ellipsis">{data.label}</span>
                        <span className={styles.timezoneOffset}>{data.offset}</span>
                      </div>
                    );
                  }}
                  onChange={(value) => handleTimezoneChange(value as string)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Hash className="size-3.5 text-foreground-description" size={14} />
                  <div className={cn(styles.fieldLabel)}>{t('taskSchedule.maxExecutions')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <InputNumber
                    className="flex-1"
                    disabled={continuous}
                    min={1}
                    placeholder={t('taskSchedule.maxExecutionsPlaceholder')}
                    size="normal"
                    value={maxExec ?? undefined}
                    onChange={handleMaxExecChange}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={continuous}
                      onCheckedChange={(checked) => handleContinuousChange(checked === true)}
                    />
                    <Label>{t('taskSchedule.continuous')}</Label>
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
});

export default SchedulerForm;
