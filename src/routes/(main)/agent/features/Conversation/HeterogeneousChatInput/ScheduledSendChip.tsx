'use client';

import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import { CalendarClockIcon, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useConversationStore } from '@/features/Conversation';

const styles = {
  chip: 'h-8 pointer-coarse:h-11 flex-none rounded-full bg-info-wash ps-2 pe-1',
  label: 'text-xs leading-5 text-info-text whitespace-nowrap',
} as const;

/**
 * The armed-schedule chip, sitting right next to the `+` menu that armed it.
 *
 * Picking a time from `+` only arms the send; this is what makes that armed
 * state visible — otherwise the send button would silently do something other
 * than send. Clearing the chip disarms it, so the way out is attached to the
 * promise.
 */
const ScheduledSendChip = memo(() => {
  const { t } = useTranslation('chat');

  const scheduledSendAt = useConversationStore((s) => s.scheduledSendAt);
  const setScheduledSendAt = useConversationStore((s) => s.setScheduledSendAt);

  if (!scheduledSendAt) return null;

  return (
    <div className={cn('flex items-center gap-1', styles.chip)}>
      <CalendarClockIcon className="size-4 text-info-text" size={16} />
      <div className={styles.label}>{formatAbsoluteDateTime(scheduledSendAt)}</div>
      <span className="inline-flex flex-none pointer-coarse:p-1.5">
        <ActionIcon
          className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
          icon={XIcon}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
          title={t('input.schedule.clear')}
          onClick={() => setScheduledSendAt(undefined)}
        />
      </span>
    </div>
  );
});

ScheduledSendChip.displayName = 'ScheduledSendChip';

export default ScheduledSendChip;
