'use client';

import { createModal, type ModalInstance, useModalContext } from '@lobehub/ui/base-ui';
import { format } from 'date-fns';
import { BellIcon, CalendarX2Icon } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';

const toDateString = (date: Date) => format(date, 'yyyy-MM-dd');
const parseDateString = (value: string | null | undefined) => {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface ReminderPreset {
  key: string;
  labelKey: string;
  remindAt: () => Date;
}

const reminderPresets: ReminderPreset[] = [
  {
    key: 'hour',
    labelKey: 'taskList.schedule.remindInHour',
    remindAt: () => new Date(Date.now() + HOUR_MS),
  },
  {
    key: 'threeHours',
    labelKey: 'taskList.schedule.remindInThreeHours',
    remindAt: () => new Date(Date.now() + 3 * HOUR_MS),
  },
  {
    key: 'tomorrow',
    labelKey: 'taskList.schedule.remindTomorrow',
    remindAt: () => {
      const date = new Date(Date.now() + DAY_MS);
      date.setHours(9, 0, 0, 0);
      return date;
    },
  },
  {
    key: 'week',
    labelKey: 'taskList.schedule.remindInWeek',
    remindAt: () => new Date(Date.now() + 7 * DAY_MS),
  },
];

interface TaskScheduleDialogContentProps {
  identifier: string;
  initialDueDate: string | null;
}

const rowClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50';

const TaskScheduleDialogContent = memo<TaskScheduleDialogContentProps>(
  ({ identifier, initialDueDate }) => {
    const { t } = useTranslation('chat');
    const { close } = useModalContext();
    const updateTask = useTaskStore((s) => s.updateTask);
    const refreshTaskList = useTaskStore((s) => s.refreshTaskList);

    const [dueDate, setDueDate] = useState<string | null>(initialDueDate);
    const [remindAt, setRemindAt] = useState<Date | null>(null);
    const [reminderLoaded, setReminderLoaded] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      let alive = true;
      void taskService
        .getReminder(identifier)
        .then((result) => {
          if (!alive) return;
          const value = result?.data?.remindAt;
          setRemindAt(value ? new Date(value) : null);
        })
        .finally(() => {
          if (alive) setReminderLoaded(true);
        });
      return () => {
        alive = false;
      };
    }, [identifier]);

    const saveDueDate = useCallback(
      async (next: string | null) => {
        if (busy) return;
        setBusy(true);
        try {
          await updateTask(identifier, { dueDate: next });
          await refreshTaskList();
          setDueDate(next);
          close();
        } finally {
          setBusy(false);
        }
      },
      [busy, close, identifier, refreshTaskList, updateTask],
    );

    const saveReminder = useCallback(
      async (next: Date | null) => {
        if (busy) return;
        setBusy(true);
        try {
          await taskService.setReminder(identifier, next);
          setRemindAt(next);
          close();
        } finally {
          setBusy(false);
        }
      },
      [busy, close, identifier],
    );

    const selectedDate = parseDateString(dueDate);

    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex min-w-40 flex-col gap-0.5 border-r border-border pr-3">
            <button
              className={rowClass}
              disabled={busy}
              type="button"
              onClick={() => void saveDueDate(toDateString(new Date()))}
            >
              {t('taskList.schedule.today', { defaultValue: 'Today' })}
            </button>
            <button
              className={rowClass}
              disabled={busy}
              type="button"
              onClick={() => void saveDueDate(toDateString(new Date(Date.now() + DAY_MS)))}
            >
              {t('taskList.schedule.tomorrow', { defaultValue: 'Tomorrow' })}
            </button>
            <button
              className={rowClass}
              disabled={busy}
              type="button"
              onClick={() => void saveDueDate(toDateString(new Date(Date.now() + 7 * DAY_MS)))}
            >
              {t('taskList.schedule.inOneWeek', { defaultValue: 'In one week' })}
            </button>
            {dueDate ? (
              <button
                className={cn(rowClass, 'text-destructive')}
                disabled={busy}
                type="button"
                onClick={() => void saveDueDate(null)}
              >
                <CalendarX2Icon size={14} />
                {t('taskList.schedule.removeDueDate', { defaultValue: 'Remove due date' })}
              </button>
            ) : null}
          </div>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) void saveDueDate(toDateString(date));
            }}
          />
        </div>
        <div className="border-t border-border pt-3">
          <div className="mb-1 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
            <BellIcon size={12} />
            {t('taskList.schedule.remindMe', { defaultValue: 'Remind me' })}
            {reminderLoaded && remindAt ? (
              <span className="text-foreground">{format(remindAt, 'MMM d, HH:mm')}</span>
            ) : null}
          </div>
          {reminderPresets.map((preset) => {
            const presetTime = preset.remindAt();
            const active =
              remindAt !== null && Math.abs(remindAt.getTime() - presetTime.getTime()) < 60_000;
            return (
              <button
                className={cn(rowClass, active && 'bg-muted')}
                disabled={busy || !reminderLoaded}
                key={preset.key}
                type="button"
                onClick={() => void saveReminder(presetTime)}
              >
                {t(preset.labelKey as never, { defaultValue: preset.key })}
              </button>
            );
          })}
          {remindAt ? (
            <button
              className={cn(rowClass, 'text-destructive')}
              disabled={busy || !reminderLoaded}
              type="button"
              onClick={() => void saveReminder(null)}
            >
              {t('taskList.schedule.removeReminder', { defaultValue: 'Remove reminder' })}
            </button>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button disabled={busy} variant="ghost" onClick={close}>
            {t('cancel', { ns: 'common' })}
          </Button>
        </div>
      </div>
    );
  },
);

TaskScheduleDialogContent.displayName = 'TaskScheduleDialogContent';

export interface OpenTaskScheduleDialogProps {
  dueDate: string | null;
  identifier: string;
}

/**
 * Linear's due-date picker as a modal — calendar + preset shortcuts on the
 * left, and the "Remind me" preset block Linear nests inside the same
 * surface. Both values apply on click; the menu/rail entries open this.
 */
export const openTaskScheduleDialog = ({
  dueDate,
  identifier,
}: OpenTaskScheduleDialogProps): ModalInstance =>
  createModal({
    content: <TaskScheduleDialogContent identifier={identifier} initialDueDate={dueDate} />,
    footer: null,
    maskClosable: true,
    styles: { header: { borderBottom: 'none' } },
    title: undefined,
    width: 'min(90vw, 560px)',
  });

export default openTaskScheduleDialog;
