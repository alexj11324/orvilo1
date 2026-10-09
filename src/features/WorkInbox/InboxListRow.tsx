'use client';
import type { NotificationFeedCard } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import {
  ArchiveRestoreIcon,
  ClockIcon,
  MailIcon,
  MailOpenIcon,
  TimerOffIcon,
  Trash2Icon,
} from 'lucide-react';
import { createElement, memo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
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
const styles = createStaticStyles(({ css }) => ({
  row: css`
    cursor: pointer;

    position: relative;

    display: flex;
    gap: 8px;
    align-items: flex-start;

    width: 100%;
    padding-block: 16px;
    padding-inline: 20px 12px;
    border: 0;
    border-block-end: 1px solid ${cssVar.colorFillQuaternary};

    font: inherit;
    color: inherit;
    text-align: start;

    appearance: none;
    background: transparent;

    &[data-unread='true'] {
      background: ${cssVar.colorPrimaryBg}55;
    }

    &[data-active='true'] {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      box-shadow: inset 0 0 0 2px ${cssVar.colorPrimary};
    }

    /* The Issue list row's hover wash; the selected row keeps its own fill. */
    &:hover:not([data-active='true']) {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  unreadDot: css`
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 8px;

    width: 6px;
    height: 6px;
    border-radius: 50%;

    background: ${cssVar.colorPrimary};
  `,
  avatarDisc: css`
    position: relative;

    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 48px;
    height: 48px;
    border-radius: 50%;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  optionButton: css`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 4px;

    color: ${cssVar.colorTextTertiary};

    appearance: none;
    background: ${cssVar.colorFillQuaternary};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
}));

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
      className={cn(styles.row, 'group')}
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
          <p className="min-w-0 flex-1 truncate text-sm">
            {senderName ? <span className="font-medium">{senderName}</span> : null}
            {senderName ? ' ' : ''}
            <span className="text-muted-foreground">{card.content}</span>
            {'.'}
          </p>
          <div className="hidden shrink-0 items-center gap-2 group-focus-within:flex group-hover:flex">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    aria-label={card.read ? t('inbox.markUnread') : t('inbox.markRead')}
                    className={styles.optionButton}
                    type="button"
                    onClick={(event) => {
                      stopRowClick(event);
                      onToggleRead(card);
                    }}
                  />
                }
              >
                {card.read ? (
                  <MailIcon aria-hidden className="size-3" />
                ) : (
                  <MailOpenIcon aria-hidden className="size-3" />
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
                    <button
                      aria-label={archivedView ? t('inbox.unarchive') : t('inbox.delete')}
                      className={styles.optionButton}
                      type="button"
                      onClick={(event) => {
                        stopRowClick(event);
                        onToggleArchive(card);
                      }}
                    />
                  }
                >
                  {archivedView ? (
                    <ArchiveRestoreIcon aria-hidden className="size-3" />
                  ) : (
                    <Trash2Icon aria-hidden className="size-3" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {archivedView ? t('inbox.unarchive') : t('inbox.delete')}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {card.availableActions.includes('snooze') ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label={t('inbox.snooze')}
                      className={styles.optionButton}
                      type="button"
                      onClick={stopRowClick}
                    />
                  }
                >
                  <ClockIcon aria-hidden className="size-3" />
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {card.resourceIdentifier ? (
              <span className="font-mono">{`${card.resourceIdentifier} `}</span>
            ) : null}
            {card.title}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-tertiary">
            {card.snoozedUntil ? (
              <>
                <ClockIcon aria-hidden className="size-3" />
                {t('inbox.snoozeUntil', {
                  date: dayjs(card.snoozedUntil).format('MMM D'),
                  time: dayjs(card.snoozedUntil).format('HH:mm'),
                })}
              </>
            ) : (
              <span title={dayjs(card.lastActivityAt).format('LLL')}>
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
