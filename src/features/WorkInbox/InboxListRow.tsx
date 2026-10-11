'use client';
import type { NotificationFeedCard } from '@orvilo/types';
import { formatAbsoluteDate, formatAbsoluteDateTime } from '@orvilo/utils/time';
import dayjs from 'dayjs';
import {
  ArchiveRestoreIcon,
  BellOffIcon,
  ClockIcon,
  MailIcon,
  MailOpenIcon,
  TimerOffIcon,
} from 'lucide-react';
import { createElement, memo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';

import { formatInboxAge } from './inboxAge';
import { INBOX_SNOOZE_DAYS, type InboxSnoozeDays, snoozeUntilForDays } from './inboxOrganize';
import { inboxRowSelectKeyDown } from './inboxRowKeyboard';
import { inboxCardIcon } from './notificationIcons';

/**
 * Plane's inbox row (`sidebar/notification-card/item.tsx`): avatar disc +
 * two clamped lines — `actor content.` over `IDENT title · timestamp` —
 * with read/archive/snooze icon buttons appearing on hover at the right of
 * the first line.
 */
const styles = {
  row: 'group relative flex w-full cursor-pointer items-start gap-2 border-0 border-be border-divider bg-transparent py-4 ps-5 pe-3 [font:inherit] text-inherit text-start [&[data-unread=true]:not([data-active=true]):not(:hover)]:bg-primary-wash data-[active=true]:bg-selected [&:hover:not([data-active=true])]:bg-accent focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50',
  unreadDot: 'absolute inset-bs-1/2 inset-s-2 size-1.5 rounded-full bg-primary',
  avatarDisc:
    'relative flex size-12 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground',
  optionButton: 'bg-muted p-0 text-muted-foreground hover:bg-selected hover:text-foreground',
};

export interface InboxListRowProps {
  /** Shown while the snoozed view is open — swaps archive for restore. */
  archivedView: boolean;
  card: NotificationFeedCard;
  onCustomSnooze: (card: NotificationFeedCard) => void;
  onSelect: (id: string, openDetail: boolean) => void;
  onSnooze: (card: NotificationFeedCard, untilIso: string) => void;
  onToggleArchive: (card: NotificationFeedCard) => void;
  onToggleRead: (card: NotificationFeedCard) => void;
  onUnsnooze: (card: NotificationFeedCard) => void;
  selected: boolean;
  snoozedView: boolean;
}

const stopRowClick = (event: MouseEvent) => {
  event.stopPropagation();
};

const SNOOZE_LABEL = {
  1: 'inbox.snoozePreset.1day',
  3: 'inbox.snoozePreset.3days',
  5: 'inbox.snoozePreset.5days',
  7: 'inbox.snoozePreset.1week',
  14: 'inbox.snoozePreset.2weeks',
} as const satisfies Record<InboxSnoozeDays, string>;

const InboxListRow = memo((props: InboxListRowProps) => {
  const {
    card,
    selected,
    archivedView,
    snoozedView,
    onSelect,
    onToggleRead,
    onToggleArchive,
    onSnooze,
    onUnsnooze,
    onCustomSnooze,
  } = props;
  const { i18n, t } = useTranslation('notification');
  const senderName = card.actor?.name ?? card.agent?.name;

  return (
    <div
      aria-current={selected ? 'true' : undefined}
      className={styles.row}
      data-active={selected}
      data-inbox-id={card.notificationId}
      data-unread={!card.read}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(card.notificationId, true)}
      onKeyDown={(event) => inboxRowSelectKeyDown(event, () => onSelect(card.notificationId, true))}
    >
      {card.read ? null : <span aria-hidden className={styles.unreadDot} />}
      <span className={styles.avatarDisc}>
        {card.agent ? (
          <AssigneeAvatar
            agentId={card.agent.id}
            size={32 /* linear-token-override: match the human actor avatar in this shared slot. */}
          />
        ) : card.actor ? (
          <Avatar
            avatar={card.actor.avatar}
            name={card.actor.name}
            size={40} // linear-token-override: Plane notification rows use a 40px avatar disc
          />
        ) : (
          createElement(inboxCardIcon(card), {
            'className': 'size-5 shrink-0',
            'aria-hidden': true,
          })
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm leading-5.5">
            {senderName ? <span className="font-medium">{senderName}</span> : null}
            {senderName ? ' ' : ''}
            <span className="text-muted-foreground">{card.content}</span>
            {'.'}
          </p>
          {/* The snooze menu popup is portaled out of this row, so once the pointer or focus
              moves into it the row stops matching `group-hover` / `group-focus-within`; without
              `has-data-popup-open` the container goes back to `display: none`, the trigger's
              rect collapses to 0x0 and the popup jumps away (the next click then lands on the
              row beneath). Base UI marks the open trigger with `data-popup-open`. */}
          <div className="hidden shrink-0 items-center gap-2 group-focus-within:flex group-hover:flex has-data-popup-open:flex">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={card.read ? t('inbox.markUnread') : t('inbox.markRead')}
                    className={styles.optionButton}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={(event) => {
                      stopRowClick(event);
                      onToggleRead(card);
                    }}
                  />
                }
              >
                {card.read ? (
                  <MailIcon aria-hidden className="size-4" />
                ) : (
                  <MailOpenIcon aria-hidden className="size-4" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {card.read ? t('inbox.markUnread') : t('inbox.markRead')}
              </TooltipContent>
            </Tooltip>
            {card.availableActions.includes('dismiss') ||
            card.availableActions.includes('archive') ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={archivedView ? t('inbox.unarchive') : t('inbox.dismiss')}
                      className={styles.optionButton}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={(event) => {
                        stopRowClick(event);
                        onToggleArchive(card);
                      }}
                    />
                  }
                >
                  {archivedView ? (
                    <ArchiveRestoreIcon aria-hidden className="size-4" />
                  ) : (
                    <BellOffIcon aria-hidden className="size-4" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {archivedView ? t('inbox.unarchive') : t('inbox.dismiss')}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {card.availableActions.includes('snooze') ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={t('inbox.snooze')}
                      className={styles.optionButton}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={stopRowClick}
                    />
                  }
                >
                  <ClockIcon aria-hidden className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={stopRowClick}>
                  {snoozedView || card.snoozedUntil ? (
                    <>
                      <DropdownMenuItem
                        onClick={(event) => {
                          stopRowClick(event);
                          onUnsnooze(card);
                        }}
                      >
                        <TimerOffIcon />
                        {t('inbox.unsnooze')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  {INBOX_SNOOZE_DAYS.map((days) => (
                    <DropdownMenuItem
                      key={days}
                      onClick={(event) => {
                        stopRowClick(event);
                        onSnooze(card, snoozeUntilForDays(days));
                      }}
                    >
                      {t(SNOOZE_LABEL[days])}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={(event) => {
                      stopRowClick(event);
                      // Same as the Issue header menu's Custom entries: the modal is
                      // imperative (rendered by ModalHost, not under this row), so it
                      // survives the menu closing.
                      onCustomSnooze(card);
                    }}
                  >
                    {t('inbox.snoozePreset.custom')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs leading-5 text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {card.resourceIdentifier ? (
              <span className="font-mono">{`${card.resourceIdentifier} `}</span>
            ) : null}
            {card.title}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-foreground-tertiary">
            {card.snoozedUntil ? (
              <>
                <ClockIcon aria-hidden className="size-3" />
                {t('inbox.snoozeUntil', {
                  date: formatAbsoluteDate(card.snoozedUntil),
                  time: dayjs(card.snoozedUntil).format('HH:mm'),
                })}
              </>
            ) : (
              <span title={formatAbsoluteDateTime(card.lastActivityAt)}>
                {formatInboxAge(card.lastActivityAt, { locale: i18n.language })}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
});

InboxListRow.displayName = 'InboxListRow';

export default InboxListRow;
