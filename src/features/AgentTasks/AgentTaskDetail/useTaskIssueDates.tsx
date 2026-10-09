import { formatAbsoluteDate, formatAbsoluteDateTime } from '@orvilo/utils/time';
import { format } from 'date-fns';
import { BellIcon, CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useClientDataSWR } from '@/libs/swr';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import { trpcErrorMessage } from '@/utils/trpcError';

import { issueDueDatePreset, issueReminderPreset, parseIssueMenuDate } from './issueMenuDates';

interface DateFormProps {
  dueDate?: string | null;
  kind: 'dueDate' | 'reminder';
  onSave: (value: Date) => Promise<void>;
}

const IssueDateForm = ({ dueDate, kind, onSave }: DateFormProps) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const [date, setDate] = useState<Date | undefined>(() =>
    dueDate && kind === 'dueDate'
      ? new Date(`${dueDate}T00:00:00`)
      : issueReminderPreset('tomorrow'),
  );
  const [time, setTime] = useState('09:00');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!date || pending) return;
        const value = new Date(date);
        if (kind === 'reminder') {
          const [hour, minute] = time.split(':').map(Number);
          value.setHours(hour, minute, 0, 0);
          if (value.getTime() <= Date.now()) {
            setError(t('taskDetail.menu.futureReminder'));
            return;
          }
        }
        setPending(true);
        setError(undefined);
        try {
          await onSave(value);
          close();
        } catch (failure) {
          setError(trpcErrorMessage(failure) ?? t('taskDetail.menu.failed'));
        } finally {
          setPending(false);
        }
      }}
    >
      {kind === 'dueDate' ? (
        <p className="text-sm text-muted-foreground">{t('taskDetail.menu.dueDateHint')}</p>
      ) : null}
      <Calendar
        mode="single"
        numberOfMonths={kind === 'dueDate' ? 2 : 1}
        selected={date}
        startMonth={kind === 'reminder' ? new Date() : undefined}
        disabled={
          pending
            ? true
            : kind === 'reminder'
              ? { before: new Date(new Date().setHours(0, 0, 0, 0)) }
              : undefined
        }
        onSelect={setDate}
      />
      {kind === 'reminder' ? (
        <label className="flex flex-col gap-1 text-sm">
          {t('taskDetail.menu.time')}
          <Input
            required
            disabled={pending}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button disabled={!date} loading={pending} type="submit">
          {t(kind === 'dueDate' ? 'taskDetail.menu.saveDueDate' : 'taskDetail.menu.applyReminder')}
        </Button>
      </div>
    </form>
  );
};

/**
 * The header menu's Due date and Remind me submenus plus their Remove entries.
 * The due date is an issue edit (write-gated); the reminder is the caller's own
 * row, so a reader can still set and clear it.
 */
export const useTaskIssueDates = ({
  taskId,
  dueDate,
  canEdit,
  open,
  closeMenu,
}: {
  canEdit: boolean;
  closeMenu: () => void;
  dueDate?: string | null;
  open: boolean;
  taskId?: string;
}) => {
  const { t } = useTranslation(['chat', 'common']);
  const updateTask = useTaskStore((s) => s.updateTask);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const [pending, setPending] = useState(false);
  const [dateQuery, setDateQuery] = useState('');
  const [reminderQuery, setReminderQuery] = useState('');
  const { data: reminder, mutate: refreshReminder } = useClientDataSWR(
    open && taskId ? ['task:reminder', taskId] : null,
    () => taskService.getReminder(taskId!),
  );
  const saveDueDate = async (date: Date | null) => {
    if (!taskId || !canEdit) return;
    await updateTask(taskId, { dueDate: date ? format(date, 'yyyy-MM-dd') : null });
    await Promise.all([refreshTaskList(), refreshTaskDetail(taskId)]);
  };
  const saveReminder = async (date: Date | null) => {
    if (!taskId) return;
    await taskService.setReminder(taskId, date);
    await refreshReminder();
  };
  const apply = async (operation: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    try {
      await operation();
    } catch (error) {
      toast.error(trpcErrorMessage(error) ?? t('taskDetail.menu.failed'));
    } finally {
      setPending(false);
    }
  };
  const custom = (kind: DateFormProps['kind']) =>
    createModal({
      content: (
        <IssueDateForm
          dueDate={dueDate}
          kind={kind}
          onSave={kind === 'dueDate' ? saveDueDate : saveReminder}
        />
      ),
      footer: null,
      title: t(kind === 'dueDate' ? 'taskDetail.menu.setDueDate' : 'taskList.schedule.remindMe'),
      width: kind === 'dueDate' ? 'min(95vw, 620px)' : 360,
    });
  const dateSearch = parseIssueMenuDate(dateQuery);
  const reminderSearch = parseIssueMenuDate(reminderQuery);
  const dueDateItem: SidebarMenuItemData = {
    key: 'dueDate',
    icon: <CalendarIcon />,
    label: t('taskDetail.menu.dueDate'),
    disabled: !canEdit || pending || !taskId,
    children: [
      {
        type: 'group',
        label: (
          <Input
            aria-label={t('taskDetail.menu.dateSearch')}
            placeholder={t('taskDetail.menu.dateSearch')}
            value={dateQuery}
            onChange={(event) => setDateQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') return;
              event.stopPropagation();
              if (event.key === 'Enter' && dateSearch) {
                event.preventDefault();
                void apply(async () => {
                  await saveDueDate(dateSearch);
                  closeMenu();
                });
              }
            }}
          />
        ),
        children: dateSearch
          ? [
              {
                key: 'due-search',
                label: formatAbsoluteDate(dateSearch),
                onClick: () => void apply(() => saveDueDate(dateSearch)),
              },
            ]
          : [],
      },
      { key: 'due-custom', label: t('taskDetail.menu.custom'), onClick: () => custom('dueDate') },
      ...(['tomorrow', 'weekEnd', 'week'] as const).map((key) => ({
        key: `due-${key}`,
        label: t(`taskDetail.menu.date.${key}`),
        extra: formatAbsoluteDate(new Date(`${issueDueDatePreset(key)}T00:00:00`)),
        onClick: () =>
          void apply(() => saveDueDate(new Date(`${issueDueDatePreset(key)}T00:00:00`))),
      })),
    ],
  };
  const reminderItem: SidebarMenuItemData = {
    key: 'remindMe',
    icon: <BellIcon />,
    label: t('taskDetail.menu.remindMe'),
    disabled: pending || !taskId,
    extra: reminder?.data?.remindAt ? formatAbsoluteDateTime(reminder.data.remindAt) : undefined,
    children: [
      {
        type: 'group',
        label: (
          <Input
            aria-label={t('taskDetail.menu.reminderSearch')}
            placeholder={t('taskDetail.menu.reminderSearch')}
            value={reminderQuery}
            onChange={(event) => setReminderQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') return;
              event.stopPropagation();
              if (
                event.key === 'Enter' &&
                reminderSearch &&
                reminderSearch.getTime() > Date.now()
              ) {
                event.preventDefault();
                void apply(async () => {
                  await saveReminder(reminderSearch);
                  closeMenu();
                });
              }
            }}
          />
        ),
        children:
          reminderSearch && reminderSearch.getTime() > Date.now()
            ? [
                {
                  key: 'reminder-search',
                  label: formatAbsoluteDateTime(reminderSearch),
                  onClick: () => void apply(() => saveReminder(reminderSearch)),
                },
              ]
            : [],
      },
      ...(['hour', 'tomorrow', 'week', 'month'] as const).map((key) => ({
        key: `reminder-${key}`,
        label: t(`taskDetail.menu.reminder.${key}`),
        onClick: () => void apply(() => saveReminder(issueReminderPreset(key))),
      })),
      {
        key: 'reminder-custom',
        label: t('taskDetail.menu.custom'),
        onClick: () => custom('reminder'),
      },
    ],
  };
  const removeDates: SidebarMenuItemData[] = [
    ...(dueDate
      ? [
          {
            key: 'remove-dueDate',
            disabled: !canEdit || pending,
            label: t('taskList.schedule.removeDueDate'),
            onClick: () => void apply(() => saveDueDate(null)),
          },
        ]
      : []),
    ...(reminder?.data?.remindAt
      ? [
          {
            key: 'remove-reminder',
            disabled: pending,
            label: t('taskList.schedule.removeReminder'),
            onClick: () => void apply(() => saveReminder(null)),
          },
        ]
      : []),
  ];
  return { dueDateItem, reminderItem, removeDates };
};
