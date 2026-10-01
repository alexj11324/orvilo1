'use client';

import { addDays, format } from 'date-fns';
import {
  BellIcon,
  BellOffIcon,
  CalendarPlusIcon,
  CalendarX2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  SunIcon,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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

const TaskScheduleDialogContent = memo<TaskScheduleDialogContentProps>(
  ({ identifier, initialDueDate }) => {
    const { t, i18n } = useTranslation('chat');
    const { close, setCanDismissByClickOutside } = useModalContext();
    const updateTask = useTaskStore((s) => s.updateTask);
    const refreshTaskList = useTaskStore((s) => s.refreshTaskList);

    const [dueDate, setDueDate] = useState<string | null>(initialDueDate);
    const [remindAt, setRemindAt] = useState<Date | null>(null);
    const [reminderLoaded, setReminderLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [month, setMonth] = useState<Date>(() => parseDateString(initialDueDate) ?? new Date());

    useEffect(() => {
      let alive = true;
      void taskService
        .getReminder(identifier)
        .then((result) => {
          if (!alive) return;
          const value = result?.data?.remindAt;
          setRemindAt(value ? new Date(value) : null);
        })
        .catch(() => {
          if (alive) toast.error(t('taskList.schedule.loadFailed'));
        })
        .finally(() => {
          if (alive) setReminderLoaded(true);
        });
      return () => {
        alive = false;
      };
    }, [identifier, t]);

    const months = useMemo(
      () =>
        Array.from({ length: 12 }, (_, index) =>
          new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
            new Date(2020, index, 1),
          ),
        ),
      [i18n.language],
    );
    const years = useMemo(() => {
      const current = new Date().getFullYear();
      return Array.from({ length: 21 }, (_, index) => current - 10 + index);
    }, []);

    const saveDueDate = useCallback(
      async (next: string | null) => {
        if (busy) return;
        setBusy(true);
        try {
          await updateTask(identifier, { dueDate: next });
          await refreshTaskList();
          setDueDate(next);
          close();
        } catch {
          toast.error(t('taskList.schedule.saveFailed'));
        } finally {
          setBusy(false);
        }
      },
      [busy, close, identifier, refreshTaskList, t, updateTask],
    );

    const saveReminder = useCallback(
      async (next: Date | null) => {
        if (busy) return;
        setBusy(true);
        try {
          await taskService.setReminder(identifier, next);
          setRemindAt(next);
          close();
        } catch {
          toast.error(t('taskList.schedule.saveFailed'));
        } finally {
          setBusy(false);
        }
      },
      [busy, close, identifier, t],
    );

    const stepMonth = (delta: number) =>
      setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

    // Select popups portal to document.body — suspend the modal's
    // outside-click dismissal while one is open or the option click
    // closes the whole dialog. Restoring on onOpenChange would race:
    // the same pointer event closes the Select before the modal
    // evaluates dismissal, so re-enable only after the popup's close
    // animation completes.
    const handleSelectOpenChange = useCallback(
      (open: boolean) => {
        if (open) setCanDismissByClickOutside(false);
      },
      [setCanDismissByClickOutside],
    );
    const handleSelectOpenChangeComplete = useCallback(
      (open: boolean) => {
        if (!open) setCanDismissByClickOutside(true);
      },
      [setCanDismissByClickOutside],
    );

    const selectedDate = parseDateString(dueDate);
    const dateFormat = useMemo(
      () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }),
      [i18n.language],
    );

    const shortcuts = [
      {
        icon: <SunIcon />,
        id: 'today',
        label: t('taskList.schedule.today', { defaultValue: 'Today' }),
        resolve: () => new Date(),
        sublabel: dateFormat.format(new Date()),
      },
      {
        icon: <ClockIcon />,
        id: 'tomorrow',
        label: t('taskList.schedule.tomorrow', { defaultValue: 'Tomorrow' }),
        resolve: () => addDays(new Date(), 1),
        sublabel: dateFormat.format(addDays(new Date(), 1)),
      },
      {
        icon: <CalendarPlusIcon />,
        id: 'week',
        label: t('taskList.schedule.inOneWeek', { defaultValue: 'In one week' }),
        resolve: () => addDays(new Date(), 7),
        sublabel: dateFormat.format(addDays(new Date(), 7)),
      },
    ];

    return (
      <div className="flex flex-col">
        <div className="flex flex-col gap-0.5">
          {shortcuts.map((shortcut) => (
            <Item
              key={shortcut.id}
              size="xs"
              render={
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => void saveDueDate(toDateString(shortcut.resolve()))}
                />
              }
            >
              <ItemMedia className="size-4 [&_svg:not([class*='size-'])]:size-4" variant="icon">
                {shortcut.icon}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{shortcut.label}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <span className="text-muted-foreground text-xs">{shortcut.sublabel}</span>
              </ItemActions>
            </Item>
          ))}
          {dueDate ? (
            <Item
              size="xs"
              render={
                <button disabled={busy} type="button" onClick={() => void saveDueDate(null)} />
              }
            >
              <ItemMedia
                className="size-4 text-destructive [&_svg:not([class*='size-'])]:size-4"
                variant="icon"
              >
                <CalendarX2Icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-destructive">
                  {t('taskList.schedule.removeDueDate', { defaultValue: 'Remove due date' })}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <span className="text-muted-foreground text-xs">
                  {format(selectedDate!, 'yyyy-MM-dd')}
                </span>
              </ItemActions>
            </Item>
          ) : null}
        </div>

        <Separator className="my-2.5" />

        <div className="flex items-center justify-between gap-1 pb-1">
          <Button
            aria-label={t('taskList.schedule.previousMonth', { defaultValue: 'Previous month' })}
            className="size-7 shrink-0 p-0"
            size="sm"
            variant="ghost"
            onClick={() => stepMonth(-1)}
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <Select
            value={months[month.getMonth()]}
            onOpenChange={handleSelectOpenChange}
            onOpenChangeComplete={handleSelectOpenChangeComplete}
            onValueChange={(value) => {
              const index = months.indexOf(String(value));
              if (index >= 0) setMonth((prev) => new Date(prev.getFullYear(), index, 1));
            }}
          >
            <SelectTrigger className="min-w-0 flex-1" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(month.getFullYear())}
            onOpenChange={handleSelectOpenChange}
            onOpenChangeComplete={handleSelectOpenChangeComplete}
            onValueChange={(value) => {
              const year = Number.parseInt(String(value), 10);
              if (!Number.isNaN(year)) setMonth((prev) => new Date(year, prev.getMonth(), 1));
            }}
          >
            <SelectTrigger className="w-20 shrink-0" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            aria-label={t('taskList.schedule.nextMonth', { defaultValue: 'Next month' })}
            className="size-7 shrink-0 p-0"
            size="sm"
            variant="ghost"
            onClick={() => stepMonth(1)}
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
        <Calendar
          hideNavigation
          className="w-full bg-transparent p-0"
          mode="single"
          month={month}
          selected={selectedDate}
          classNames={{
            month_caption: 'hidden',
            nav: 'hidden',
          }}
          onMonthChange={setMonth}
          onSelect={(date) => {
            if (date) void saveDueDate(toDateString(date));
          }}
        />

        <Separator className="my-2.5" />

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 px-2 pb-1 text-muted-foreground text-xs font-medium">
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
              <Item
                className={cn(active && 'bg-accent')}
                key={preset.key}
                size="xs"
                render={
                  <button
                    disabled={busy || !reminderLoaded}
                    type="button"
                    onClick={() => void saveReminder(presetTime)}
                  />
                }
              >
                <ItemMedia className="size-4 [&_svg:not([class*='size-'])]:size-4" variant="icon">
                  <BellIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-normal">
                    {t(preset.labelKey as never, { defaultValue: preset.key })}
                  </ItemTitle>
                </ItemContent>
              </Item>
            );
          })}
          {remindAt ? (
            <Item
              size="xs"
              render={
                <button
                  disabled={busy || !reminderLoaded}
                  type="button"
                  onClick={() => void saveReminder(null)}
                />
              }
            >
              <ItemMedia
                className="size-4 text-destructive [&_svg:not([class*='size-'])]:size-4"
                variant="icon"
              >
                <BellOffIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-destructive">
                  {t('taskList.schedule.removeReminder', { defaultValue: 'Remove reminder' })}
                </ItemTitle>
              </ItemContent>
            </Item>
          ) : null}
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
 * Linear's due-date picker as a modal — shortcut rows, the ReUI
 * month/year-header calendar, and the "Remind me" preset block Linear nests
 * inside the same surface. Values apply on click; the menu/rail entries open
 * this.
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
    width: 'min(90vw, 320px)',
  });

export default openTaskScheduleDialog;
