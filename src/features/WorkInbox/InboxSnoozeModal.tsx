'use client';
import dayjs, { type Dayjs } from 'dayjs';
import { t } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import DatePicker from '@/components/DatePicker';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Plane's "Custom" snooze: a date + time pair resolved to an absolute moment
 * in the user's own timezone.
 */
const InboxSnoozeContent = ({ onConfirm }: { onConfirm: (iso: string) => void }) => {
  const { t } = useTranslation('notification');
  const { t: tCommon } = useTranslation('common');
  const { close } = useModalContext();
  const [date, setDate] = useState<Dayjs | null>(() => dayjs().add(1, 'day'));
  const [time, setTime] = useState('09:00');

  const confirm = () => {
    if (!date) return;
    const [hour = 9, minute = 0] = time.split(':').map(Number);
    onConfirm(date.hour(hour).minute(minute).second(0).millisecond(0).toDate().toISOString());
    close();
  };

  return (
    <div className="flex flex-col gap-3">
      <DatePicker
        minDate={dayjs()}
        picker={'date'}
        value={date}
        onChange={(value) => setDate(dayjs.isDayjs(value) ? value : null)}
      />
      <Input
        aria-label={t('inbox.snoozeCustomTime')}
        type="time"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={close}>
          {tCommon('cancel')}
        </Button>
        <Button disabled={!date} onClick={confirm}>
          {t('inbox.snooze')}
        </Button>
      </div>
    </div>
  );
};

export const openInboxSnoozeModal = (onConfirm: (iso: string) => void) =>
  createModal({
    content: <InboxSnoozeContent onConfirm={onConfirm} />,
    footer: null,
    title: t('inbox.snoozeCustomTitle', { ns: 'notification' }),
    width: 360,
  });
