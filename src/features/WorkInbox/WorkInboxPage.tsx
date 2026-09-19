'use client';

import { Center, Empty, Flexbox, Icon, Input, Tooltip } from '@lobehub/ui';
import {
  ActionIcon,
  Alert,
  Button,
  type DropdownItem,
  DropdownMenu,
  Segmented,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { DecisionVerb, NotificationFeedCard } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import {
  ArchiveIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  InboxIcon,
  MailOpenIcon,
  MoreHorizontalIcon,
  TimerOffIcon,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { inboxKeys } from '@/libs/swr/keys';
import { notificationService } from '@/services/notification';
import { workAttentionService } from '@/services/workAttention';

import { inboxCardTitleKey } from './inboxCardCopy';
import { versionedDecisionFromCard, visibleDecisionVerbs } from './inboxDecide';
import { INBOX_FEED_FOCUS_THROTTLE_MS, inboxFeedListMode } from './inboxFeedState';
import {
  feedFilterForChip,
  INBOX_FILTER_CHIPS,
  inboxBulkFingerprint,
  type InboxFilterChip,
  inboxUrlOpenMode,
  snoozeUntilIso,
} from './inboxOrganize';
import { inboxSurface, shouldMarkInboxCardRead } from './inboxSurface';
import { useInboxListKeyboard } from './useInboxListKeyboard';

const styles = createStaticStyles(({ css }) => ({
  stage: css`
    position: relative;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  `,
  list: css`
    overflow: hidden auto;
    flex: 1;

    min-width: 300px;
    max-width: 380px;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  listHeader: css`
    flex: none;
    padding-block: 8px 4px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  row: css`
    cursor: pointer;

    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorFillQuaternary};

    transition: background ${cssVar.motionDurationFast};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    &[data-active='true'] {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  unreadDot: css`
    flex: none;

    width: 8px;
    height: 8px;
    border-radius: 50%;

    background: ${cssVar.colorPrimary};
  `,
  snippet: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    color: ${cssVar.colorTextSecondary};
  `,
  time: css`
    flex: none;
    color: ${cssVar.colorTextQuaternary};
    white-space: nowrap;
  `,
  pane: css`
    overflow: auto;
    flex: 1;
    min-width: 0;
    padding: 24px;
  `,
  paneMeta: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  divider: css`
    height: 1px;
    background: ${cssVar.colorBorderSecondary};
  `,
  keptMounted: css`
    pointer-events: none;
    position: absolute;
    inset: 0;
    visibility: hidden;
  `,
}));

const WorkInboxPage = memo(() => {
  const { t } = useTranslation('notification');
  const { t: tCommon } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'action' | 'activity'>('action');
  const [filterChip, setFilterChip] = useState<InboxFilterChip>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [inputDraft, setInputDraft] = useState('');

  const kind = tab === 'action' ? 'action' : 'update';
  const filter = feedFilterForChip(filterChip);
  const { data, isLoading } = useClientDataSWR(
    inboxKeys.feed(workspaceId, kind, filter, undefined),
    () => notificationService.feed({ filter, kind, limit: 50 }),
    { focusThrottleInterval: INBOX_FEED_FOCUS_THROTTLE_MS },
  );
  const cards = useMemo(() => data?.cards ?? [], [data?.cards]);
  const partial = Boolean(data?.partial);
  const listMode = inboxFeedListMode({
    cardCount: cards.length,
    isLoading,
    partial,
  });
  const { data: summary } = useClientDataSWR(inboxKeys.feedSummary(workspaceId), () =>
    notificationService.feedSummary(),
  );

  const selected = useMemo(
    () => cards.find((card) => card.notificationId === selectedId) ?? null,
    [cards, selectedId],
  );
  const decisionVerbs = selected ? visibleDecisionVerbs(selected) : [];
  const titleFor = (card: NotificationFeedCard) => {
    const key = inboxCardTitleKey(card);
    return key ? t(key) : card.title;
  };

  useEffect(() => {
    setInputDraft('');
  }, [selectedId]);
  const cardIds = useMemo(() => cards.map((card) => card.notificationId), [cards]);
  const surface = inboxSurface(isMobile, detailOpen);
  const selectedNotificationId = selected?.notificationId;
  const selectedActivityVersion = selected?.activityVersion;
  const markSelectedRead = shouldMarkInboxCardRead({
    cardId: selectedNotificationId ?? '',
    selectedId,
    surface,
  });

  useEffect(() => {
    if (selectedId && !cards.some((card) => card.notificationId === selectedId)) {
      setSelectedId(null);
      setDetailOpen(false);
    }
  }, [cards, selectedId]);

  useEffect(() => {
    if (!markSelectedRead || !selectedNotificationId || selectedActivityVersion === undefined) {
      return;
    }
    void notificationService.markReadObserved(selectedNotificationId, selectedActivityVersion);
  }, [markSelectedRead, selectedActivityVersion, selectedNotificationId]);

  const refresh = useCallback(async () => {
    await Promise.all([
      mutate(inboxKeys.feed(workspaceId, kind, filter, undefined)),
      mutate(inboxKeys.feedSummary(workspaceId)),
      mutate(inboxKeys.unreadCount(workspaceId)),
    ]);
  }, [filter, kind, workspaceId]);

  const organizeFailed = useCallback(() => {
    toast.error(t('inbox.organizeFailed'));
  }, [t]);

  const archiveCard = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.archive(card.notificationId, card.activityVersion);
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [organizeFailed, refresh],
  );

  const snoozeCard = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.snooze(
          card.notificationId,
          snoozeUntilIso(),
          card.activityVersion,
        );
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [organizeFailed, refresh],
  );

  const markCardUnread = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.markUnread(card.notificationId, card.activityVersion);
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [organizeFailed, refresh],
  );

  const decide = useCallback(
    async (
      card: NotificationFeedCard,
      decision: DecisionVerb,
      inputPayload?: Record<string, unknown>,
    ) => {
      const command = versionedDecisionFromCard(card, decision, {
        idempotencyKey: crypto.randomUUID(),
        inputPayload,
      });
      if (!command) return;
      try {
        const result = await workAttentionService.decide(command);
        const status = result.data.status;
        if (status === 'stale' || status === 'expired') {
          toast.error(t('inbox.actionStale'));
        } else if (status === 'outcome_unknown') {
          toast.error(t('inbox.actionUnknown'));
        } else if (status === 'source_accepted' || status === 'source_confirmed') {
          toast.success(t('inbox.actionAccepted'));
        } else if (status === 'already_decided') {
          toast.info(t('inbox.actionAlreadyDecided'));
        } else {
          toast.success(t('inbox.actionRecorded'));
        }
        await refresh();
      } catch {
        toast.error(t('inbox.actionFailed'));
      }
    },
    [refresh, t],
  );

  const openTarget = useCallback(
    (card: NotificationFeedCard) => {
      const nav = card.safeNavigation;
      if (nav?.kind === 'task' && nav.taskId) {
        navigate(taskDetailPath(nav.taskId, undefined, card.title));
        return;
      }
      if (nav?.kind === 'url' && nav.url) {
        const mode = inboxUrlOpenMode(nav.url);
        if (mode === 'internal') navigate(nav.url);
        if (mode === 'external') window.open(nav.url, '_blank', 'noopener,noreferrer');
      }
    },
    [navigate],
  );

  const selectCard = useCallback((id: string, openDetail: boolean) => {
    setSelectedId(id);
    if (openDetail) setDetailOpen(true);
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const prepared = await notificationService.prepareBulk({
        action: 'mark_read',
        queryFingerprint: inboxBulkFingerprint('mark_read', filterChip, kind),
      });
      await notificationService.applyBulk(prepared.data.token);
      await refresh();
    } catch {
      organizeFailed();
    }
  }, [filterChip, kind, organizeFailed, refresh]);

  const archiveAll = useCallback(async () => {
    try {
      const prepared = await notificationService.prepareBulk({
        action: 'archive',
        queryFingerprint: inboxBulkFingerprint('archive', filterChip, kind),
      });
      await notificationService.applyBulk(prepared.data.token);
      await refresh();
    } catch {
      organizeFailed();
    }
  }, [filterChip, kind, organizeFailed, refresh]);

  const filterLabel = (chip: InboxFilterChip) => {
    if (chip === 'all') return t('inbox.allStatus');
    if (chip === 'unread') return t('inbox.unread');
    if (chip === 'mentions') return t('inbox.filterMentions');
    if (chip === 'snoozed') return t('inbox.filterSnoozed');
    return t('inbox.filterArchived');
  };

  useInboxListKeyboard({
    ids: cardIds,
    onBack: surface === 'detail' ? () => setDetailOpen(false) : undefined,
    onOpen: () => {
      if (isMobile && selectedId && !detailOpen) {
        setDetailOpen(true);
        return;
      }
      if (selected) openTarget(selected);
    },
    onSelect: (id) => selectCard(id, false),
    selectedId: selected?.notificationId ?? null,
  });

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {tCommon('tab.inbox')}
          </Text>
        }
      />
      <Flexbox horizontal className={styles.stage} flex={1}>
        <Flexbox className={cx(styles.list, surface === 'detail' && styles.keptMounted)}>
          <Flexbox className={styles.listHeader} gap={4}>
            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <TabsRoot
                style={{ flex: 1, minWidth: 0 }}
                value={tab}
                onValueChange={(value) => setTab(value as 'action' | 'activity')}
              >
                <TabsList>
                  <TabsIndicator />
                  <TabsTab value="action">
                    {t('inbox.actionTab')}
                    {summary?.pendingActionCount ? ` ${summary.pendingActionCount}` : ''}
                  </TabsTab>
                  <TabsTab value="activity">
                    {t('inbox.activityTab')}
                    {summary?.unreadUpdateCount ? ` ${summary.unreadUpdateCount}` : ''}
                  </TabsTab>
                </TabsList>
              </TabsRoot>
              <Flexbox horizontal align={'center'} flex={'none'}>
                <Tooltip title={t('inbox.markAllRead')}>
                  <ActionIcon
                    icon={CheckCheckIcon}
                    size={'small'}
                    onClick={() => void markAllRead()}
                  />
                </Tooltip>
                <Tooltip title={t('inbox.archiveAll')}>
                  <ActionIcon icon={ArchiveIcon} size={'small'} onClick={() => void archiveAll()} />
                </Tooltip>
              </Flexbox>
            </Flexbox>
            <Segmented
              block
              size={'small'}
              value={filterChip}
              options={INBOX_FILTER_CHIPS.map((chip) => ({
                label: filterLabel(chip),
                value: chip,
              }))}
              onChange={(value) => setFilterChip(value as InboxFilterChip)}
            />
          </Flexbox>
          {partial ? (
            <Alert
              showIcon
              description={t('inbox.sourceUnavailable')}
              style={{ margin: 8 }}
              type="warning"
            />
          ) : null}
          {listMode === 'loading' ? (
            <SkeletonList padding={12} rows={8} />
          ) : listMode === 'empty' ? (
            <Center flex={1} padding={48}>
              <Empty description={t('inbox.empty')} icon={InboxIcon} />
            </Center>
          ) : listMode === 'partial-empty' ? null : (
            cards.map((card) => (
              <div
                className={styles.row}
                data-active={card.notificationId === selected?.notificationId}
                data-inbox-id={card.notificationId}
                key={card.notificationId}
                onClick={() => selectCard(card.notificationId, true)}
              >
                <Flexbox horizontal align={'center'} gap={8}>
                  {card.read ? null : <span className={styles.unreadDot} />}
                  <Flexbox flex={1} style={{ minWidth: 0 }}>
                    <Text ellipsis weight={card.read ? 400 : 600}>
                      {titleFor(card)}
                    </Text>
                  </Flexbox>
                  <Text className={styles.time} fontSize={12}>
                    {dayjs(card.lastActivityAt).fromNow()}
                  </Text>
                </Flexbox>
                <Flexbox horizontal gap={8}>
                  <span style={{ width: card.read ? 0 : 8, flex: 'none' }} />
                  <Text className={styles.snippet} fontSize={12}>
                    {card.content}
                  </Text>
                </Flexbox>
              </div>
            ))
          )}
        </Flexbox>
        <Flexbox className={cx(styles.pane, surface === 'list' && styles.keptMounted)} gap={16}>
          {surface === 'detail' ? (
            <Flexbox horizontal>
              <Button icon={ChevronLeftIcon} size={'small'} onClick={() => setDetailOpen(false)}>
                {tCommon('back')}
              </Button>
            </Flexbox>
          ) : null}
          {!selected ? (
            <Center flex={1}>
              <Empty description={t('inbox.selectItem')} icon={InboxIcon} />
            </Center>
          ) : (
            <>
              <Flexbox gap={4}>
                <Text fontSize={16} weight={600}>
                  {titleFor(selected)}
                </Text>
                <Text className={styles.paneMeta} fontSize={12}>
                  {dayjs(selected.lastActivityAt).fromNow()}
                  {!selected.read ? ` · ${t('inbox.unread')}` : ''}
                </Text>
              </Flexbox>
              <Text type={'secondary'}>{selected.content}</Text>
              <div className={styles.divider} />
              <Flexbox gap={8}>
                {decisionVerbs.includes('submit_input') ? (
                  <Input
                    placeholder={t('inbox.inputPlaceholder')}
                    value={inputDraft}
                    onChange={(event) => setInputDraft(event.target.value)}
                  />
                ) : null}
                <Flexbox horizontal gap={8} style={{ flexWrap: 'wrap' }}>
                  {decisionVerbs.includes('approve') ? (
                    <Button type="primary" onClick={() => void decide(selected, 'approve')}>
                      {t('inbox.approve')}
                    </Button>
                  ) : null}
                  {decisionVerbs.includes('decline') ? (
                    <Button onClick={() => void decide(selected, 'decline')}>
                      {t('inbox.decline')}
                    </Button>
                  ) : null}
                  {decisionVerbs.includes('cancel') ? (
                    <Button onClick={() => void decide(selected, 'cancel')}>
                      {t('inbox.cancel')}
                    </Button>
                  ) : null}
                  {decisionVerbs.includes('submit_input') ? (
                    <Button
                      disabled={!inputDraft.trim()}
                      type="primary"
                      onClick={() =>
                        void decide(selected, 'submit_input', { text: inputDraft.trim() })
                      }
                    >
                      {t('inbox.submitInput')}
                    </Button>
                  ) : null}
                  <Button icon={ExternalLinkIcon} onClick={() => openTarget(selected)}>
                    {t('inbox.open')}
                  </Button>
                  <DropdownMenu
                    placement={'bottomRight'}
                    items={
                      [
                        selected.availableActions.includes('archive')
                          ? {
                              icon: <Icon icon={ArchiveIcon} />,
                              key: 'archive',
                              label: t('inbox.archive'),
                              onClick: () => void archiveCard(selected),
                            }
                          : null,
                        selected.availableActions.includes('snooze')
                          ? {
                              icon: <Icon icon={TimerOffIcon} />,
                              key: 'snooze',
                              label: t('inbox.snooze'),
                              onClick: () => void snoozeCard(selected),
                            }
                          : null,
                        selected.read
                          ? {
                              icon: <Icon icon={MailOpenIcon} />,
                              key: 'markUnread',
                              label: t('inbox.markUnread'),
                              onClick: () => void markCardUnread(selected),
                            }
                          : null,
                      ].filter(Boolean) as DropdownItem[]
                    }
                  >
                    <ActionIcon icon={MoreHorizontalIcon} title={t('inbox.moreActions')} />
                  </DropdownMenu>
                </Flexbox>
              </Flexbox>
            </>
          )}
        </Flexbox>
      </Flexbox>
    </Flexbox>
  );
});

WorkInboxPage.displayName = 'WorkInboxPage';

export default WorkInboxPage;
