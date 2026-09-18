'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import {
  Button,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { NotificationFeedCard } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { inboxKeys } from '@/libs/swr/keys';
import { notificationService } from '@/services/notification';
import { workAttentionService } from '@/services/workAttention';

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
    overflow: auto;
    flex: 1;

    min-width: 280px;
    max-width: 420px;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  row: css`
    cursor: pointer;
    padding-block: 12px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorFillTertiary};

    &[data-active='true'] {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  pane: css`
    overflow: auto;
    flex: 1;
    min-width: 0;
    padding: 24px;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const kind = tab === 'action' ? 'action' : 'update';
  const { data: cards = [], isLoading } = useClientDataSWR(
    inboxKeys.feed(workspaceId, kind, undefined, undefined),
    () => notificationService.feed({ kind, limit: 50 }),
  );
  const { data: summary } = useClientDataSWR(inboxKeys.feedSummary(workspaceId), () =>
    notificationService.feedSummary(),
  );

  const selected = useMemo(
    () => cards.find((card) => card.notificationId === selectedId) ?? null,
    [cards, selectedId],
  );
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
      mutate(inboxKeys.feed(workspaceId, kind, undefined, undefined)),
      mutate(inboxKeys.feedSummary(workspaceId)),
      mutate(inboxKeys.unreadCount(workspaceId)),
    ]);
  }, [kind, workspaceId]);

  const decide = useCallback(
    async (card: NotificationFeedCard, decision: 'approve' | 'decline') => {
      if (!card.actionRef) return;
      try {
        const result = await workAttentionService.decide({
          actionRef: card.actionRef,
          decision,
          idempotencyKey: crypto.randomUUID(),
        });
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
      if (nav?.kind === 'url' && nav.url) navigate(nav.url);
    },
    [navigate],
  );

  const selectCard = useCallback((id: string, openDetail: boolean) => {
    setSelectedId(id);
    if (openDetail) setDetailOpen(true);
  }, []);

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
          <TabsRoot value={tab} onValueChange={(value) => setTab(value as 'action' | 'activity')}>
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
          {isLoading ? (
            <Text style={{ padding: 16 }} type="secondary">
              {t('inbox.loading')}
            </Text>
          ) : cards.length === 0 ? (
            <Empty description={t('inbox.empty')} />
          ) : (
            cards.map((card) => (
              <div
                className={styles.row}
                data-active={card.notificationId === selected?.notificationId}
                data-inbox-id={card.notificationId}
                key={card.notificationId}
                onClick={() => selectCard(card.notificationId, true)}
              >
                <Text weight={card.read ? 400 : 600}>{card.title}</Text>
                <Text type="secondary">{card.content}</Text>
              </div>
            ))
          )}
        </Flexbox>
        <Flexbox className={cx(styles.pane, surface === 'list' && styles.keptMounted)} gap={16}>
          {surface === 'detail' ? (
            <Button onClick={() => setDetailOpen(false)}>{tCommon('back')}</Button>
          ) : null}
          {!selected ? (
            <Empty description={t('inbox.selectItem')} />
          ) : (
            <>
              <Text weight={600}>{selected.title}</Text>
              <Text>{selected.content}</Text>
              <Flexbox horizontal gap={8}>
                {selected.availableActions.includes('decide') && selected.actionRef ? (
                  <>
                    <Button type="primary" onClick={() => void decide(selected, 'approve')}>
                      {t('inbox.approve')}
                    </Button>
                    <Button onClick={() => void decide(selected, 'decline')}>
                      {t('inbox.decline')}
                    </Button>
                  </>
                ) : null}
                <Button onClick={() => openTarget(selected)}>{t('inbox.open')}</Button>
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
