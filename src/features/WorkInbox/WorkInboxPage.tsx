'use client';

import { Center, Empty, Flexbox, Icon, Input, Tooltip } from '@lobehub/ui';
import {
  ActionIcon,
  Alert,
  Button,
  type DropdownItem,
  DropdownMenu,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { DecisionVerb, NotificationFeedCard } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  ArchiveIcon,
  ArrowLeftRightIcon,
  AtSignIcon,
  BellIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  CircleUserRoundIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  InboxIcon,
  KeyRoundIcon,
  ListFilterIcon,
  type LucideIcon,
  MailOpenIcon,
  MoreHorizontalIcon,
  TimerOffIcon,
} from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurfaceSplit } from '@/features/WorkSurface';
import { useIsMobile } from '@/hooks/useIsMobile';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { inboxKeys } from '@/libs/swr/keys';
import { notificationService } from '@/services/notification';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import { inboxCardTitleKey } from './inboxCardCopy';
import {
  inboxActionIdentity,
  versionedDecisionFromCard,
  visibleDecisionVerbs,
} from './inboxDecide';
import {
  clearInboxDecisionOperation,
  decisionStillOpen,
  type InboxDecisionIdentity,
  inboxDecisionStorageKey,
  inboxInputDigest,
  planInboxDecisionOperation,
  settleInboxDecisionOperation,
} from './inboxDecisionOps';
import { inboxDraftKeyForCard, useInboxDraft } from './inboxDrafts';
import { inboxFeedScopeKey, mergeInboxFeedPages, useInboxFeedPager } from './inboxFeedPager';
import { INBOX_FEED_FOCUS_THROTTLE_MS, inboxFeedListMode } from './inboxFeedState';
import {
  armInboxReadReceiptSuppression,
  type InboxReadReceiptAttempt,
  type InboxReadReceiptRetention,
  resolveInboxReadReceiptAttempt,
  resolveInboxReadReceiptRetention,
  retainSelectedInboxCard,
} from './inboxListSelection';
import {
  feedFilterForChip,
  INBOX_FILTER_CHIPS,
  INBOX_SNOOZE_PRESETS,
  inboxBulkFingerprint,
  type InboxFilterChip,
  type InboxSnoozePreset,
  inboxUrlOpenMode,
  resolveInboxFilterChip,
  resolveInboxTab,
  snoozeUntilForPreset,
} from './inboxOrganize';
import { inboxSurface, shouldMarkInboxCardRead } from './inboxSurface';
import { useInboxListKeyboard } from './useInboxListKeyboard';

// The shared task body — mounted inside the split detail pane, lazily so the
// inbox list does not pay for it until a task-backed card is actually opened.
const LazyIssueContent = lazy(() =>
  import('@/features/AgentTasks').then((module) => ({ default: module.IssueContent })),
);

const styles = createStaticStyles(({ css }) => ({
  stage: css`
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
  `,
  listColumn: css`
    display: flex;
    flex-direction: column;
    min-height: 100%;
  `,
  listHeader: css`
    flex: none;
    padding-block: 6px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  row: css`
    cursor: pointer;

    width: 100%;
    min-height: 55px;
    padding-block: 6px;
    padding-inline: 12px;
    border: 0;
    border-block-end: 1px solid ${cssVar.colorFillQuaternary};

    font: inherit;
    color: inherit;
    text-align: start;

    appearance: none;
    background: transparent;

    transition: background ${cssVar.motionDurationFast};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    &[data-active='true'] {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      box-shadow: inset 0 0 0 2px ${cssVar.colorPrimary};
    }
  `,
  typeGlyph: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    border-radius: 50%;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
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
    -webkit-line-clamp: 1;

    color: ${cssVar.colorTextSecondary};
  `,
  time: css`
    flex: none;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  detail: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
  `,
  detailPlaceholder: css`
    min-height: 100%;
  `,
  paneMeta: css`
    color: ${cssVar.colorTextTertiary};
  `,
  divider: css`
    height: 1px;
    background: ${cssVar.colorBorderSecondary};
  `,
  /* Mobile detail surface: the split keeps the list mounted underneath so its
     scroll/selection return; the overlay is the detail's single scroll owner. */
  detailOverlay: css`
    position: absolute;
    z-index: 1;
    inset: 0;

    overflow-y: auto;

    background: ${cssVar.colorBgLayout};
  `,
}));

/* Notification-type glyph is the fallback for system events — human and
   agent senders render their snapshotted avatar instead (feed card actor). */
const INBOX_TYPE_ICON: Record<string, LucideIcon> = {
  acp_permission: KeyRoundIcon,
  mention: AtSignIcon,
  resource_transfer: ArrowLeftRightIcon,
  task_assigned: CircleUserRoundIcon,
  workspace_ownership_transfer: ArrowLeftRightIcon,
};

const inboxCardIcon = (card: NotificationFeedCard): LucideIcon => {
  if (card.type.includes('review')) return GitPullRequestIcon;
  return INBOX_TYPE_ICON[card.type] ?? BellIcon;
};

const WorkInboxPage = memo(() => {
  const { t } = useTranslation('notification');
  const { t: tCommon } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const userId = useUserStore(userProfileSelectors.userId);
  const navigate = useWorkspaceAwareNavigate();
  const isMobile = useIsMobile();
  // Selection, tab, filter and the mobile detail surface live in the URL so a
  // refresh/back/deep link restores the exact inbox state (and stays shareable).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveInboxTab(searchParams.get('tab'));
  const filterChip = resolveInboxFilterChip(searchParams.get('filter'));
  const selectedId = searchParams.get('item');
  const detailOpen = searchParams.get('detail') === '1';
  const [pendingDecisions, setPendingDecisions] = useState<ReadonlySet<string>>(() => new Set());
  const readReceiptRetentionRef = useRef<InboxReadReceiptRetention<NotificationFeedCard> | null>(
    null,
  );
  const readReceiptAttemptRef = useRef<InboxReadReceiptAttempt | null>(null);

  const writeInboxParams = useCallback(
    (patch: { detail?: string | null; filter?: string; item?: string | null; tab?: string }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (patch.tab !== undefined) {
            if (patch.tab === 'priority') next.delete('tab');
            else next.set('tab', patch.tab);
          }
          if (patch.filter !== undefined) {
            if (patch.filter === 'all') next.delete('filter');
            else next.set('filter', patch.filter);
          }
          if (patch.item !== undefined) {
            if (patch.item === null) next.delete('item');
            else next.set('item', patch.item);
          }
          if (patch.detail !== undefined) {
            if (patch.detail === null) next.delete('detail');
            else next.set('detail', patch.detail);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // `kind` is the feed bucket: the tab queries the priority classification
  // (pending action or unread mention) rather than the stored row kind.
  const kind = tab;
  const filter = feedFilterForChip(filterChip);
  const { data, error, isLoading } = useClientDataSWR(
    inboxKeys.feed(workspaceId, kind, filter, undefined),
    () => notificationService.feed({ filter, kind, limit: 50 }),
    { focusThrottleInterval: INBOX_FEED_FOCUS_THROTTLE_MS },
  );
  // Pages beyond the first stay client-side so a focus-triggered refetch of
  // page one never reorders rows the user already paged through. The pager is
  // bound to user + workspace + query fingerprint + request generation: a
  // page fetched under a stale scope can never commit into the new one.
  const feedScope = useMemo(
    () => inboxFeedScopeKey({ filter, kind, userId, workspaceId }),
    [filter, kind, userId, workspaceId],
  );
  const pager = useInboxFeedPager(feedScope);
  const tail = pager.tailFor(feedScope);
  const cards = useMemo(
    () => mergeInboxFeedPages(data?.cards ?? [], tail?.cards ?? []),
    [data?.cards, tail],
  );
  const hasMore = tail ? tail.hasMore : (data?.hasMore ?? false);
  const loadMoreError = pager.loadMoreError;
  const loadingMore = pager.loadingMore;
  const loadMore = useCallback(async () => {
    await pager.loadMore(feedScope, data?.nextCursor ?? null, (cursor) =>
      notificationService.feed({ cursor, filter, kind, limit: 50 }),
    );
  }, [data?.nextCursor, feedScope, filter, kind, pager]);
  const partial = Boolean(data?.partial);
  const { data: summary } = useClientDataSWR(inboxKeys.feedSummary(workspaceId), () =>
    notificationService.feedSummary(),
  );

  // The selection resolves independently of the loaded pages: a deep link into
  // page 2+ fetches its card by id (authorized, same feed scope) instead of
  // depending on the row happening to be loaded.
  const listed = useMemo(
    () => cards.find((card) => card.notificationId === selectedId) ?? null,
    [cards, selectedId],
  );
  const { data: fetchedCard, isLoading: fetchingCard } = useClientDataSWR(
    selectedId && !listed ? inboxKeys.feedCard(workspaceId, selectedId) : null,
    () => notificationService.feedCard(selectedId as string),
  );
  const readReceiptRetention = resolveInboxReadReceiptRetention(
    readReceiptRetentionRef.current,
    selectedId,
    feedScope,
  );
  const selected = listed ?? fetchedCard ?? readReceiptRetention?.card ?? null;
  const visibleCards = retainSelectedInboxCard(cards, selected, readReceiptRetention);
  const listMode = inboxFeedListMode({
    cardCount: visibleCards.length,
    isLoading,
    partial,
  });
  const selectedTaskId =
    selected?.safeNavigation?.kind === 'task' ? selected.safeNavigation.taskId : undefined;
  // Reply drafts persist per (user, workspace, request, request generation):
  // switching between pending requests never loses or leaks an unsubmitted
  // draft, and a notification-level update never orphans it.
  const draftKey = selected ? inboxDraftKeyForCard(selected, { userId, workspaceId }) : null;
  const [inputDraft, setInputDraft, clearDraftFor] = useInboxDraft(draftKey);
  const decisionVerbs = selected ? visibleDecisionVerbs(selected) : [];
  const titleFor = (card: NotificationFeedCard) => {
    const key = inboxCardTitleKey(card);
    return key ? t(key) : card.title;
  };

  const cardIds = useMemo(() => visibleCards.map((card) => card.notificationId), [visibleCards]);
  const surface = inboxSurface(isMobile, detailOpen);
  const selectedNotificationId = selected?.notificationId;
  const selectedActivityVersion = selected?.activityVersion;
  const selectedRead = selected?.read;
  const markSelectedRead = shouldMarkInboxCardRead({
    cardId: selectedNotificationId ?? '',
    selectedId,
    surface,
  });

  useEffect(() => {
    // Departure is terminal for this transient row. Clear the stored object,
    // not only the rendered resolution, so A → B → A cannot resurrect content
    // captured under an earlier selection or workspace scope.
    readReceiptRetentionRef.current = resolveInboxReadReceiptRetention(
      readReceiptRetentionRef.current,
      selectedId,
      feedScope,
    );
    readReceiptAttemptRef.current = resolveInboxReadReceiptAttempt(
      readReceiptAttemptRef.current,
      selectedId,
      feedScope,
    );
  }, [feedScope, selectedId]);

  useEffect(() => {
    // Clear a dead selection only once the list AND the by-id lookup both
    // settled — a deep link into a not-yet-loaded page must not be dropped.
    if (
      selectedId &&
      !isLoading &&
      !fetchingCard &&
      (!selected || (!listed && fetchedCard === null))
    ) {
      readReceiptRetentionRef.current = null;
      writeInboxParams({ detail: null, item: null });
    }
  }, [fetchedCard, fetchingCard, isLoading, listed, selected, selectedId, writeInboxParams]);

  useEffect(() => {
    if (
      !markSelectedRead ||
      !selectedNotificationId ||
      selectedActivityVersion === undefined ||
      selectedRead !== false
    ) {
      return;
    }
    const currentAttempt = readReceiptAttemptRef.current;
    if (
      currentAttempt?.scope === feedScope &&
      currentAttempt.notificationId === selectedNotificationId &&
      currentAttempt.activityVersion === selectedActivityVersion
    ) {
      return;
    }
    readReceiptAttemptRef.current = {
      activityVersion: selectedActivityVersion,
      notificationId: selectedNotificationId,
      scope: feedScope,
    };
    const selectedIndex = cards.findIndex((card) => card.notificationId === selectedNotificationId);
    if (selectedIndex >= 0 && selected) {
      readReceiptRetentionRef.current = {
        card: selected,
        index: selectedIndex,
        scope: feedScope,
      };
    }
    notificationService
      .markReadObserved(selectedNotificationId, selectedActivityVersion)
      .then(() => {
        // The receipt drives badge/summary invalidation — selection alone is
        // never treated as a completed read. The feed row refreshes too so
        // the unread dot clears at the same moment the badge does.
        void mutate(inboxKeys.feedSummary(workspaceId));
        void mutate(inboxKeys.unreadCount(workspaceId));
        void mutate(inboxKeys.feed(workspaceId, kind, filter, undefined));
        void mutate(inboxKeys.feedCard(workspaceId, selectedNotificationId));
      })
      .catch(() => {
        readReceiptAttemptRef.current = null;
        readReceiptRetentionRef.current = null;
        toast.error(t('inbox.organizeFailed'));
      });
  }, [
    cards,
    feedScope,
    filter,
    kind,
    markSelectedRead,
    selected,
    selectedActivityVersion,
    selectedNotificationId,
    selectedRead,
    t,
    workspaceId,
  ]);

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
        // The row leaves this view — update the loaded tail at once; the
        // archived filter keeps it because it still belongs there.
        if (filterChip !== 'archived') pager.removeCard(card.notificationId);
        if (card.notificationId === selectedId) {
          readReceiptRetentionRef.current = null;
          writeInboxParams({ detail: null, item: null });
        }
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [filterChip, organizeFailed, pager, refresh, selectedId, writeInboxParams],
  );

  const snoozeCard = useCallback(
    async (card: NotificationFeedCard, preset: InboxSnoozePreset) => {
      try {
        const until = snoozeUntilForPreset(preset);
        await notificationService.snooze(card.notificationId, until, card.activityVersion);
        // Snoozed cards stay listed in every view; patch the tail copy too.
        pager.updateCard(card.notificationId, (current) => ({
          ...current,
          snoozedUntil: until,
        }));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [organizeFailed, pager, refresh],
  );

  const markCardUnread = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.markUnread(card.notificationId, card.activityVersion);
        const suppression = armInboxReadReceiptSuppression({
          activityVersion: card.activityVersion,
          notificationId: card.notificationId,
          scope: feedScope,
          selectedId,
        });
        if (suppression) readReceiptAttemptRef.current = suppression;
        pager.updateCard(card.notificationId, (current) => ({
          ...current,
          read: false,
          readVersion: current.readVersion + 1,
        }));
        void mutate(inboxKeys.feedCard(workspaceId, card.notificationId));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [feedScope, organizeFailed, pager, refresh, selectedId, workspaceId],
  );

  const decide = useCallback(
    async (
      card: NotificationFeedCard,
      decision: DecisionVerb,
      inputPayload?: Record<string, unknown>,
    ) => {
      const pendingKey = `${card.notificationId}:${decision}`;
      if (pendingDecisions.has(pendingKey)) return;
      const identity = inboxActionIdentity(card);
      if (!identity) return;
      // One operationId per user intent — request identity + source version +
      // execution generation + decision + input digest, persisted so a refresh
      // cannot mint a second server operation. Editing the input or a new
      // request generation is a new intent and mints a new id.
      const decisionIdentity: InboxDecisionIdentity = {
        decision,
        executionGeneration: identity.executionGeneration,
        inputDigest: inboxInputDigest(inputPayload),
        requestId: identity.requestId,
        sourceRevision: identity.sourceRevision,
      };
      const storageKey = inboxDecisionStorageKey({
        decision,
        requestId: identity.requestId,
        userId,
        workspaceId,
      });
      const plan = planInboxDecisionOperation(storageKey, decisionIdentity);
      const command = versionedDecisionFromCard(card, decision, {
        idempotencyKey: plan.operationId,
        inputPayload,
      });
      if (!command) return;
      setPendingDecisions((prev) => new Set(prev).add(pendingKey));
      try {
        if (plan.needsReconcile) {
          // The previous attempt ended `outcome_unknown` — reconcile the
          // original operation before resending instead of blind-resending.
          // A reconcile failure throws: the send is skipped, the flagged
          // operation is kept for the next retry.
          const latest = await notificationService.feedCard(card.notificationId);
          const state = decisionStillOpen(latest, decision);
          if (state === 'alreadyResolved') {
            clearInboxDecisionOperation(storageKey);
            toast.info(t('inbox.actionAlreadyDecided'));
            await refresh();
            return;
          }
          if (state === 'gone') {
            clearInboxDecisionOperation(storageKey);
            toast.error(t('inbox.actionStale'));
            await refresh();
            return;
          }
          // Still open: resend the SAME operationId — server idempotency
          // returns the original receipt if the first attempt landed.
        }
        const result = await workAttentionService.decide(command);
        const status = result.data.status;
        settleInboxDecisionOperation(storageKey, decisionIdentity, status);
        if (status === 'stale' || status === 'expired') {
          toast.error(t('inbox.actionStale'));
        } else if (status === 'outcome_unknown') {
          // The operation stays flagged — the retry reconciles it first.
          toast.error(t('inbox.actionUnknown'));
        } else {
          if (decision === 'submit_input') {
            const key = inboxDraftKeyForCard(card, { userId, workspaceId });
            if (key) clearDraftFor(key);
          }
          if (status === 'source_accepted' || status === 'source_confirmed') {
            toast.success(t('inbox.actionAccepted'));
          } else if (status === 'already_decided') {
            toast.info(t('inbox.actionAlreadyDecided'));
          } else {
            toast.success(t('inbox.actionRecorded'));
          }
          // A decided card leaves the pending view — drop it from the tail
          // immediately instead of waiting for a full refetch.
          pager.removeCard(card.notificationId);
          if (card.notificationId === selectedId) {
            readReceiptRetentionRef.current = null;
            writeInboxParams({ detail: null, item: null });
          }
        }
        await refresh();
      } catch {
        toast.error(t('inbox.actionFailed'));
      } finally {
        setPendingDecisions((prev) => {
          const next = new Set(prev);
          next.delete(pendingKey);
          return next;
        });
      }
    },
    [
      pendingDecisions,
      refresh,
      t,
      userId,
      workspaceId,
      pager,
      clearDraftFor,
      selectedId,
      writeInboxParams,
    ],
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

  const selectCard = useCallback(
    (id: string, openDetail: boolean) => {
      writeInboxParams({ detail: openDetail ? '1' : undefined, item: id });
    },
    [writeInboxParams],
  );

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
      readReceiptRetentionRef.current = null;
      writeInboxParams({ detail: null, item: null });
      await refresh();
    } catch {
      organizeFailed();
    }
  }, [filterChip, kind, organizeFailed, refresh, writeInboxParams]);

  const filterLabel = (chip: InboxFilterChip) => {
    if (chip === 'all') return t('inbox.allStatus');
    if (chip === 'unread') return t('inbox.unread');
    if (chip === 'mentions') return t('inbox.filterMentions');
    if (chip === 'snoozed') return t('inbox.filterSnoozed');
    return t('inbox.filterArchived');
  };

  useInboxListKeyboard({
    ids: cardIds,
    onBack: surface === 'detail' ? () => writeInboxParams({ detail: null }) : undefined,
    onOpen: () => {
      if (isMobile && selectedId && !detailOpen) {
        writeInboxParams({ detail: '1' });
        return;
      }
      if (selected) openTarget(selected);
    },
    onSelect: (id) => selectCard(id, false),
    selectedId: selected?.notificationId ?? null,
  });

  const listPane = (
    <div className={styles.listColumn}>
      <Flexbox className={styles.listHeader} gap={4}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <TabsRoot
            size={'small'}
            style={{ flex: 1, minWidth: 0 }}
            value={tab}
            onValueChange={(value) => writeInboxParams({ tab: value })}
          >
            <TabsList>
              <TabsIndicator />
              <TabsTab value="priority">
                {t('inbox.priorityTab')}
                {(summary?.pendingActionCount ?? 0) + (summary?.unreadMentionCount ?? 0)
                  ? ` ${(summary?.pendingActionCount ?? 0) + (summary?.unreadMentionCount ?? 0)}`
                  : ''}
              </TabsTab>
              <TabsTab value="other">
                {t('inbox.otherTab')}
                {summary?.unreadOtherCount ? ` ${summary.unreadOtherCount}` : ''}
              </TabsTab>
            </TabsList>
          </TabsRoot>
          <Flexbox horizontal align={'center'} flex={'none'}>
            <DropdownMenu
              placement={'bottomRight'}
              items={INBOX_FILTER_CHIPS.map((chip) => ({
                icon: chip === filterChip ? <Icon icon={CheckIcon} size={14} /> : undefined,
                key: chip,
                label: filterLabel(chip),
                onClick: () => writeInboxParams({ filter: chip }),
              }))}
            >
              <Tooltip title={t('inbox.filterBy', { filter: filterLabel(filterChip) })}>
                <ActionIcon icon={ListFilterIcon} size={'small'} style={{ borderRadius: 9999 }} />
              </Tooltip>
            </DropdownMenu>
            <Tooltip title={t('inbox.markAllRead')}>
              <ActionIcon
                icon={CheckCheckIcon}
                size={'small'}
                style={{ borderRadius: 9999 }}
                onClick={() => void markAllRead()}
              />
            </Tooltip>
            <Tooltip title={t('inbox.archiveAll')}>
              <ActionIcon
                icon={ArchiveIcon}
                size={'small'}
                style={{ borderRadius: 9999 }}
                onClick={() => void archiveAll()}
              />
            </Tooltip>
          </Flexbox>
        </Flexbox>
      </Flexbox>
      {partial ? (
        <Alert
          showIcon
          description={t('inbox.sourceUnavailable')}
          style={{ margin: 8 }}
          type="warning"
        />
      ) : null}
      {error ? (
        <Alert
          showIcon
          description={t('inbox.loadFailed')}
          style={{ margin: 8 }}
          type="error"
          action={
            <Button size={'small'} type={'text'} onClick={() => void refresh()}>
              {tCommon('retry')}
            </Button>
          }
        />
      ) : null}
      {listMode === 'loading' ? (
        <SkeletonList padding={12} rows={8} />
      ) : error && cards.length === 0 ? (
        <Center flex={1} padding={24}>
          <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
        </Center>
      ) : listMode === 'empty' ? (
        <Center flex={1} padding={48}>
          <Empty description={t('inbox.empty')} icon={InboxIcon} />
        </Center>
      ) : listMode === 'partial-empty' ? (
        <Center flex={1} padding={48}>
          <Empty description={t('inbox.empty')} icon={InboxIcon} />
        </Center>
      ) : (
        <>
          {visibleCards.map((card) => (
            <button
              aria-current={card.notificationId === selected?.notificationId ? 'true' : undefined}
              className={styles.row}
              data-active={card.notificationId === selected?.notificationId}
              data-inbox-id={card.notificationId}
              key={card.notificationId}
              type="button"
              onClick={() => selectCard(card.notificationId, true)}
            >
              <Flexbox horizontal align={'center'} gap={10}>
                {card.actor || card.agent ? (
                  <Avatar
                    avatar={card.actor?.avatar ?? card.agent?.avatar}
                    background={card.agent?.backgroundColor}
                    name={card.actor?.name ?? card.agent?.name}
                    size={28}
                  />
                ) : (
                  <span className={styles.typeGlyph}>
                    <Icon icon={inboxCardIcon(card)} size={14} />
                  </span>
                )}
                <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
                  <Flexbox horizontal align={'center'} gap={6}>
                    {card.read ? null : <span className={styles.unreadDot} />}
                    <Text ellipsis fontSize={13} weight={500}>
                      {titleFor(card)}
                    </Text>
                  </Flexbox>
                  <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
                    <Text className={styles.snippet} fontSize={12}>
                      {card.content}
                    </Text>
                    <Text className={styles.time} fontSize={12}>
                      {dayjs(card.lastActivityAt).fromNow()}
                    </Text>
                  </Flexbox>
                </Flexbox>
              </Flexbox>
            </button>
          ))}
          {hasMore || loadMoreError ? (
            <Center padding={12} style={{ flexDirection: 'column', gap: 8 }}>
              {loadMoreError ? (
                <Text fontSize={12} type={'danger'}>
                  {t('inbox.loadFailed')}
                </Text>
              ) : null}
              {hasMore ? (
                <Button loading={loadingMore} size={'small'} onClick={() => void loadMore()}>
                  {t('inbox.loadMore')}
                </Button>
              ) : null}
            </Center>
          ) : null}
        </>
      )}
    </div>
  );

  const detailPane = selected ? (
    <div className={styles.detail}>
      {surface === 'detail' ? (
        <Flexbox horizontal>
          <Button
            icon={ChevronLeftIcon}
            size={'small'}
            onClick={() => writeInboxParams({ detail: null, item: null })}
          >
            {tCommon('back')}
          </Button>
        </Flexbox>
      ) : null}
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
            <Button
              loading={pendingDecisions.has(`${selected.notificationId}:approve`)}
              type="primary"
              onClick={() => void decide(selected, 'approve')}
            >
              {t('inbox.approve')}
            </Button>
          ) : null}
          {decisionVerbs.includes('decline') ? (
            <Button
              loading={pendingDecisions.has(`${selected.notificationId}:decline`)}
              onClick={() => void decide(selected, 'decline')}
            >
              {t('inbox.decline')}
            </Button>
          ) : null}
          {decisionVerbs.includes('cancel') ? (
            <Button
              loading={pendingDecisions.has(`${selected.notificationId}:cancel`)}
              onClick={() => void decide(selected, 'cancel')}
            >
              {t('inbox.cancel')}
            </Button>
          ) : null}
          {decisionVerbs.includes('submit_input') ? (
            <Button
              disabled={!inputDraft.trim()}
              loading={pendingDecisions.has(`${selected.notificationId}:submit_input`)}
              type="primary"
              onClick={() => void decide(selected, 'submit_input', { text: inputDraft.trim() })}
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
                      // Pick an absolute moment, not a bare "4h" —
                      // every preset resolves against local time.
                      children: INBOX_SNOOZE_PRESETS.map((preset) => ({
                        key: `snooze-${preset}`,
                        label: t(`inbox.snoozePreset.${preset}`),
                        onClick: () => void snoozeCard(selected, preset),
                      })),
                      icon: <Icon icon={TimerOffIcon} />,
                      key: 'snooze',
                      label: t('inbox.snooze'),
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
      {selectedTaskId ? (
        // Task-backed cards open the shared issue body in place — properties,
        // activity and comments work without leaving the inbox; the action
        // card above stays the request itself. IssueContent mounts directly
        // in the pane's scroll owner — no nested scroll host, no page chrome.
        <Suspense fallback={<SkeletonList padding={8} rows={4} />}>
          <LazyIssueContent taskId={selectedTaskId} />
        </Suspense>
      ) : null}
    </div>
  ) : null;

  const detailPlaceholder = (
    <Center className={styles.detailPlaceholder} flex={1} padding={48}>
      <Empty
        icon={InboxIcon}
        description={
          listMode === 'list' && filterChip === 'all' && summary
            ? t('inbox.unreadCount', {
                count: tab === 'priority' ? summary.unreadBadgeCount : summary.unreadOtherCount,
              })
            : listMode === 'list'
              ? t('inbox.loadedCount', { count: visibleCards.length })
              : t('inbox.selectItem')
        }
      />
    </Center>
  );

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {tCommon('tab.inbox')}
          </Text>
        }
      />
      <div className={styles.stage}>
        <WorkSurfaceSplit
          detail={surface === 'split' ? (detailPane ?? detailPlaceholder) : undefined}
          detailLabel={selected ? titleFor(selected) : t('inbox.selectItem')}
          list={listPane}
          listLabel={tCommon('tab.inbox')}
          listWidth={400}
        />
        {surface === 'detail' && detailPane && selected ? (
          <div aria-label={titleFor(selected)} className={styles.detailOverlay}>
            {detailPane}
          </div>
        ) : null}
      </div>
    </Flexbox>
  );
});

WorkInboxPage.displayName = 'WorkInboxPage';

export default WorkInboxPage;
