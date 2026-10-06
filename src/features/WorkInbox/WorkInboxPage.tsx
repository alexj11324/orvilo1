'use client';
import type { DecisionVerb, NotificationFeedCard } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import {
  ArrowUpRightIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  InboxIcon,
  ListFilterIcon,
  MoreVerticalIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import {
  createElement,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurfaceSplit } from '@/features/WorkSurface';
import { useIsMobile } from '@/hooks/useIsMobile';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { inboxKeys } from '@/libs/swr/keys';
import { notificationService } from '@/services/notification';
import { workAttentionService } from '@/services/workAttention';
import { useTaskStore } from '@/store/task';
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
import { inboxDeepLinkTerminal, resolveInboxDeepLink } from './inboxDeepLink';
import { inboxDraftKeyForCard, useInboxDraft } from './inboxDrafts';
import { inboxFeedScopeKey, mergeInboxFeedPages, useInboxFeedPager } from './inboxFeedPager';
import { INBOX_FEED_FOCUS_THROTTLE_MS, inboxFeedListMode } from './inboxFeedState';
import InboxListRow from './InboxListRow';
import InboxListRowSkeleton from './InboxListRowSkeleton';
import {
  armInboxReadReceiptSuppression,
  type InboxReadReceiptAttempt,
  type InboxReadReceiptRetention,
  resolveInboxReadReceiptAttempt,
  resolveInboxReadReceiptRetention,
  retainSelectedInboxCard,
} from './inboxListSelection';
import { InboxNativeIntervention } from './InboxNativeIntervention';
import {
  INBOX_TABS,
  INBOX_TYPE_FILTERS,
  type InboxDisplayOption,
  inboxIssueTaskId,
  inboxOpenTarget,
  type InboxTab,
  type InboxTypeFilter,
  resolveInboxDisplayOption,
  resolveInboxTab,
  resolveInboxTypeFilters,
  serializeInboxTypeFilters,
} from './inboxOrganize';
import { openInboxSnoozeModal } from './InboxSnoozeModal';
import { inboxSurface, shouldMarkInboxCardRead } from './inboxSurface';
import { INBOX_LIST_HOTKEY_OPTIONS, useInboxListKeyboard } from './useInboxListKeyboard';

// The shared task body — mounted inside the split detail pane, lazily so the
// inbox list does not pay for it until a task-backed card is actually opened.
const LazyIssueContent = lazy(() =>
  import('@/features/AgentTasks').then((module) => ({ default: module.IssueContent })),
);

/**
 * Plane's inbox layout: a narrow list column whose chrome lives *inside* the
 * column — title+icon row (h-header), the All|Mentions tab row, then the
 * applied-filters strip — and a detail pane on the right.
 * (docs/research/plane/inbox/PAGE_TOPOLOGY.md)
 */
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
  columnHeader: css`
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    height: 48px;
    padding-inline: 16px 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  tabsRow: css`
    display: flex;
    flex: none;
    align-items: stretch;

    height: 36px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  tab: css`
    cursor: pointer;

    position: relative;

    padding-inline: 12px;
    border: 0;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};

    appearance: none;
    background: transparent;

    &:hover {
      color: ${cssVar.colorTextSecondary};
    }

    &[data-active='true'] {
      color: ${cssVar.colorPrimary};
    }
  `,
  tabUnderline: css`
    position: absolute;
    inset-block-end: 0;
    inset-inline: 0;

    height: 2px;
    border-radius: 4px 4px 0 0;

    background: ${cssVar.colorPrimary};
  `,
  appliedFilters: css`
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  filterPill: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    padding-block: 3px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 999px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    appearance: none;
    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
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
  /**
   * Task-linked cards get the detail chrome: a sticky header row carrying the
   * issue identifier plus pin/open actions, while the issue body scrolls
   * beneath it — the same peek-header contract `MyWorkIssuePane` uses.
   */
  paneHeader: css`
    position: sticky;
    z-index: 2;
    inset-block-start: 0;

    display: flex;
    gap: 4px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 16px 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
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

    background: ${cssVar.colorBgContainer};
  `,
}));

const WorkInboxPage = memo(() => {
  const { t } = useTranslation('notification');
  const { t: tCommon } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const userId = useUserStore(userProfileSelectors.userId);
  const navigate = useWorkspaceAwareNavigate();
  const isMobile = useIsMobile();
  // Tab, display option, type filters, selection and the mobile detail surface
  // all live in the URL so a refresh/back/deep link restores the exact inbox
  // state (and stays shareable).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveInboxTab(searchParams.get('tab'));
  const displayOption = resolveInboxDisplayOption(searchParams.get('filter'));
  const unreadOnly = searchParams.get('unread') === '1';
  const typeFilters = resolveInboxTypeFilters(searchParams.get('types'));
  const selectedId = searchParams.get('item');
  const detailOpen = searchParams.get('detail') === '1';
  const [pendingDecisions, setPendingDecisions] = useState<ReadonlySet<string>>(() => new Set());
  const [organizeBusy, setOrganizeBusy] = useState<'markAll' | 'refresh' | null>(null);
  const readReceiptRetentionRef = useRef<InboxReadReceiptRetention<NotificationFeedCard> | null>(
    null,
  );
  const readReceiptAttemptRef = useRef<InboxReadReceiptAttempt | null>(null);
  // Toast dedupe for dead deep links — StrictMode re-runs effects, and a param
  // clear must never double-report.
  const deadLinkToastRef = useRef<string | null>(null);

  const writeInboxParams = useCallback(
    (patch: {
      detail?: string | null;
      filter?: InboxDisplayOption | null;
      item?: string | null;
      tab?: InboxTab | null;
      types?: string | null;
      unread?: string | null;
    }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (patch.tab !== undefined) {
            if (patch.tab === 'all' || patch.tab === null) next.delete('tab');
            else next.set('tab', patch.tab);
          }
          if (patch.filter !== undefined) {
            if (patch.filter === null) next.delete('filter');
            else next.set('filter', patch.filter);
          }
          if (patch.unread !== undefined) {
            if (patch.unread === null) next.delete('unread');
            else next.set('unread', patch.unread);
          }
          if (patch.types !== undefined) {
            if (!patch.types) next.delete('types');
            else next.set('types', patch.types);
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

  // Plane's feed query: the tab sends `mentioned` (the All view excludes
  // mentions), the ⋮ menu sends a single base `filter` plus an optional
  // `unread` overlay on archived/snoozed, and the funnel sends `types`.
  const mentioned = tab === 'mentions';
  const feedInput = useMemo(
    () => ({
      filter: displayOption,
      mentioned,
      types: typeFilters.length > 0 ? typeFilters : undefined,
      // `unread` on its own is already a base filter — only the combination
      // (Plane's read=false + archived/snoozed) needs the overlay flag.
      unreadOnly: unreadOnly && displayOption && displayOption !== 'unread' ? true : undefined,
    }),
    [displayOption, mentioned, typeFilters, unreadOnly],
  );
  const feedScope = useMemo(
    () =>
      inboxFeedScopeKey({
        filter: displayOption,
        mentioned,
        types: serializeInboxTypeFilters(typeFilters),
        unreadOnly,
        userId,
        workspaceId,
      }),
    [displayOption, mentioned, typeFilters, unreadOnly, userId, workspaceId],
  );
  const feedKey = inboxKeys.feed(workspaceId, feedScope);
  const { data, error, isLoading } = useClientDataSWR(
    feedKey,
    () => notificationService.feed({ ...feedInput, limit: 50 }),
    { focusThrottleInterval: INBOX_FEED_FOCUS_THROTTLE_MS },
  );
  // Pages beyond the first stay client-side so a focus-triggered refetch of
  // page one never reorders rows the user already paged through. The pager is
  // bound to user + workspace + query fingerprint + request generation: a
  // page fetched under a stale scope can never commit into the new one.
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
      notificationService.feed({ ...feedInput, cursor, limit: 50 }),
    );
  }, [data?.nextCursor, feedScope, feedInput, pager]);
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
  const {
    data: fetchedCard,
    error: fetchCardError,
    isValidating: validatingCard,
    mutate: retryFetchCard,
  } = useClientDataSWR(
    selectedId && !listed ? inboxKeys.feedCard(workspaceId, selectedId) : null,
    () => notificationService.feedCard(selectedId as string),
    {
      // A terminal id (malformed, gone, unreadable) can never resolve — skip
      // the default backoff so the dead link drops on the first settle instead
      // of after ~30s of pointless retries.
      shouldRetryOnError: (err: Error) => !inboxDeepLinkTerminal(err),
    },
  );
  const deepLink = resolveInboxDeepLink({
    error: fetchCardError,
    fetched: fetchedCard,
    listed: Boolean(listed),
    selectedId,
    validating: validatingCard,
  });
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
  // Task-linked cards render the shared issue surface as the pane body. The
  // open target is the single eligibility check — a card that cannot route to
  // a task never mounts one.
  const selectedIssueTaskId = selected ? inboxIssueTaskId(selected) : null;
  // The canonical identifier (e.g. `T-501`) resolves once the issue fetch
  // lands — the store double-keys `taskDetailMap` under the requested id, so a
  // raw DB-id target still surfaces the readable crumb in the pane header.
  const selectedIssueIdentifier = useTaskStore((s) =>
    selectedIssueTaskId ? s.taskDetailMap[selectedIssueTaskId]?.identifier : undefined,
  );
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
    if (!selectedId) {
      deadLinkToastRef.current = null;
      return;
    }
    // A `?item=` the by-id lookup proved terminal — the row is gone or the id
    // can never resolve — falls back to the plain list: drop the dead params
    // and say why, once per id. Transient failures keep the params; the
    // detail pane's retry owns them.
    if (deepLink !== 'dead') return;
    readReceiptRetentionRef.current = null;
    writeInboxParams({ detail: null, item: null });
    if (deadLinkToastRef.current !== selectedId) {
      deadLinkToastRef.current = selectedId;
      toast.error(t('inbox.itemUnavailable'));
    }
  }, [deepLink, selectedId, t, writeInboxParams]);

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
        void mutate(feedKey);
        void mutate(inboxKeys.feedCard(workspaceId, selectedNotificationId));
      })
      .catch(() => {
        readReceiptAttemptRef.current = null;
        readReceiptRetentionRef.current = null;
        toast.error(t('inbox.organizeFailed'));
      });
  }, [
    cards,
    feedKey,
    feedScope,
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
      mutate(feedKey),
      mutate(inboxKeys.feedSummary(workspaceId)),
      mutate(inboxKeys.unreadCount(workspaceId)),
    ]);
  }, [feedKey, workspaceId]);

  const organizeFailed = useCallback(() => {
    toast.error(t('inbox.organizeFailed'));
  }, [t]);

  const releaseSelection = useCallback(
    (card: NotificationFeedCard) => {
      // Same contract as archive/decide: a card that left this view releases
      // the selection instead of leaving the detail pane on a row the list no
      // longer holds.
      if (card.notificationId === selectedId) {
        readReceiptRetentionRef.current = null;
        writeInboxParams({ detail: null, item: null });
      }
    },
    [selectedId, writeInboxParams],
  );

  const dismissCard = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.dismiss(card.notificationId, card.activityVersion);
        pager.removeCard(card.notificationId);
        releaseSelection(card);
        toast.success(t('inbox.toast.deleted'));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [organizeFailed, pager, refresh, releaseSelection, t],
  );

  const unarchiveCard = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.unarchive(card.notificationId, card.activityVersion);
        // An unarchived row leaves the archived view; elsewhere it is a no-op.
        if (displayOption === 'archived') {
          pager.removeCard(card.notificationId);
          releaseSelection(card);
        }
        toast.success(t('inbox.toast.unarchived'));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [displayOption, organizeFailed, pager, refresh, releaseSelection, t],
  );

  const toggleArchiveCard = useCallback(
    (card: NotificationFeedCard) =>
      displayOption === 'archived' ? unarchiveCard(card) : dismissCard(card),
    [dismissCard, displayOption, unarchiveCard],
  );

  const snoozeCard = useCallback(
    async (card: NotificationFeedCard, until: string) => {
      try {
        await notificationService.snooze(card.notificationId, until, card.activityVersion);
        // Snoozed cards hide until wake: drop the row everywhere except the
        // snoozed view, where it just updates its countdown.
        if (displayOption === 'snoozed') {
          pager.updateCard(card.notificationId, (current) => ({
            ...current,
            snoozedUntil: until,
          }));
        } else {
          pager.removeCard(card.notificationId);
          releaseSelection(card);
        }
        toast.success(t('inbox.toast.snoozed'));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [displayOption, organizeFailed, pager, refresh, releaseSelection, t],
  );

  const unsnoozeCard = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.unsnooze(card.notificationId, card.activityVersion);
        // The row rejoins the visible feed — it leaves the snoozed view and
        // wakes up everywhere else.
        if (displayOption === 'snoozed') {
          pager.removeCard(card.notificationId);
          releaseSelection(card);
        } else {
          pager.updateCard(card.notificationId, (current) => ({
            ...current,
            snoozedUntil: null,
          }));
        }
        toast.success(t('inbox.toast.unsnoozed'));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [displayOption, organizeFailed, pager, refresh, releaseSelection, t],
  );

  const markCardRead = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.markReadObserved(card.notificationId, card.activityVersion);
        pager.updateCard(card.notificationId, (current) => ({
          ...current,
          read: true,
          readVersion: Math.max(current.readVersion, current.activityVersion),
        }));
        void mutate(inboxKeys.feedCard(workspaceId, card.notificationId));
        toast.success(t('inbox.toast.read'));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [organizeFailed, pager, refresh, t, workspaceId],
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
          readVersion: 0,
        }));
        void mutate(inboxKeys.feedCard(workspaceId, card.notificationId));
        toast.success(t('inbox.toast.unread'));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [feedScope, organizeFailed, pager, refresh, selectedId, t, workspaceId],
  );

  const toggleReadCard = useCallback(
    (card: NotificationFeedCard) => (card.read ? markCardUnread(card) : markCardRead(card)),
    [markCardRead, markCardUnread],
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
          releaseSelection(card);
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
    [pendingDecisions, refresh, t, userId, workspaceId, pager, clearDraftFor, releaseSelection],
  );

  const openTarget = useCallback(
    (card: NotificationFeedCard) => {
      // `inboxOpenTarget` is the single eligibility check — it also rejects
      // targets the card never offered (no `open` action) or that have no
      // client route, so callers can never fire a dead navigation.
      const target = inboxOpenTarget(card);
      if (!target) return;
      if (target.kind === 'task') {
        navigate(taskDetailPath(target.taskId, undefined, card.title));
        return;
      }
      if (target.kind === 'navigate') navigate(target.to);
      if (target.kind === 'external') window.open(target.url, '_blank', 'noopener,noreferrer');
    },
    [navigate],
  );
  const selectedOpenTarget = selected ? inboxOpenTarget(selected) : null;

  const selectCard = useCallback(
    (id: string, openDetail: boolean) => {
      writeInboxParams({ detail: openDetail ? '1' : undefined, item: id });
    },
    [writeInboxParams],
  );

  const markAllRead = useCallback(async () => {
    if (organizeBusy) return;
    setOrganizeBusy('markAll');
    try {
      // Plane's "mark all as read" — the whole feed, captured at one
      // statement snapshot (not just the current view).
      await notificationService.markAllAsRead();
      await refresh();
    } catch {
      organizeFailed();
    } finally {
      setOrganizeBusy(null);
    }
  }, [organizeBusy, organizeFailed, refresh]);

  // The header advertises ⌥U like the reference — bind it for real so the
  // hint is never a dead affordance.
  useHotkeys('alt+u', () => void markAllRead(), INBOX_LIST_HOTKEY_OPTIONS, [markAllRead]);

  const refreshFeed = useCallback(async () => {
    if (organizeBusy) return;
    setOrganizeBusy('refresh');
    try {
      await refresh();
    } finally {
      setOrganizeBusy(null);
    }
  }, [organizeBusy, refresh]);

  // Plane's ⋮ menu: unread is independent while archived/snoozed are
  // exclusive — they share the same `filter` slot, so checking one drops the
  // other. `unread` under an archived/snoozed base rides on the `unread`
  // overlay param instead of replacing it.
  const showUnreadChecked = displayOption === 'unread' || unreadOnly;
  const toggleUnread = useCallback(() => {
    if (displayOption === 'archived' || displayOption === 'snoozed') {
      writeInboxParams({ unread: unreadOnly ? null : '1' });
      return;
    }
    writeInboxParams({ filter: displayOption === 'unread' ? null : 'unread' });
  }, [displayOption, unreadOnly, writeInboxParams]);
  const toggleArchived = useCallback(() => {
    writeInboxParams({ filter: displayOption === 'archived' ? null : 'archived' });
  }, [displayOption, writeInboxParams]);
  const toggleSnoozed = useCallback(() => {
    writeInboxParams({ filter: displayOption === 'snoozed' ? null : 'snoozed' });
  }, [displayOption, writeInboxParams]);
  const toggleTypeFilter = useCallback(
    (filter: InboxTypeFilter) => {
      const next = typeFilters.includes(filter)
        ? typeFilters.filter((item) => item !== filter)
        : [...typeFilters, filter];
      writeInboxParams({ types: serializeInboxTypeFilters(next) || null });
    },
    [typeFilters, writeInboxParams],
  );

  const openCustomSnooze = useCallback(
    (card: NotificationFeedCard) => {
      openInboxSnoozeModal((until) => void snoozeCard(card, until));
    },
    [snoozeCard],
  );

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

  const tabCount = (which: InboxTab) =>
    which === 'mentions' ? (summary?.unreadMentionCount ?? 0) : (summary?.unreadBadgeCount ?? 0);

  const listPane = (
    <div className={styles.listColumn}>
      <div className={styles.columnHeader}>
        <div className="flex min-w-0 items-center gap-2">
          {createElement(InboxIcon, {
            'aria-hidden': true,
            'className': 'size-4 shrink-0 text-muted-foreground',
          })}
          <span className="truncate text-sm font-medium">{tCommon('tab.inbox')}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('inbox.markAllRead')}
                  disabled={organizeBusy !== null}
                  size="icon"
                  variant="ghost"
                  onClick={() => void markAllRead()}
                />
              }
            >
              {organizeBusy === 'markAll' ? <Spinner /> : <CheckCheckIcon />}
            </TooltipTrigger>
            <TooltipContent>{t('inbox.markAllRead')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('inbox.refresh')}
                  disabled={organizeBusy !== null}
                  size="icon"
                  variant="ghost"
                  onClick={() => void refreshFeed()}
                />
              }
            >
              {organizeBusy === 'refresh' ? <Spinner /> : <RefreshCwIcon />}
            </TooltipTrigger>
            <TooltipContent>{t('inbox.refresh')}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={<Button aria-label={t('inbox.filters')} size="icon" variant="ghost" />}
                  />
                }
              >
                <ListFilterIcon />
              </TooltipTrigger>
              <TooltipContent>{t('inbox.filters')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {INBOX_TYPE_FILTERS.map((filter) => (
                <DropdownMenuCheckboxItem
                  checked={typeFilters.includes(filter)}
                  closeOnClick={false}
                  key={filter}
                  onCheckedChange={() => toggleTypeFilter(filter)}
                >
                  {t(`inbox.filterType.${filter}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button aria-label={t('inbox.displayOptions')} size="icon" variant="ghost" />
                    }
                  />
                }
              >
                <MoreVerticalIcon />
              </TooltipTrigger>
              <TooltipContent>{t('inbox.displayOptions')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={showUnreadChecked}
                closeOnClick={false}
                onCheckedChange={toggleUnread}
              >
                {t('inbox.showUnread')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={displayOption === 'archived'}
                closeOnClick={false}
                onCheckedChange={toggleArchived}
              >
                {t('inbox.showArchived')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={displayOption === 'snoozed'}
                closeOnClick={false}
                onCheckedChange={toggleSnoozed}
              >
                {t('inbox.showSnoozed')}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className={styles.tabsRow} role="tablist">
        {INBOX_TABS.map((which) => {
          const count = tabCount(which);
          return (
            <button
              aria-selected={tab === which}
              className={styles.tab}
              data-active={tab === which}
              key={which}
              role="tab"
              type="button"
              onClick={() => writeInboxParams({ tab: which })}
            >
              <span className="flex h-full items-center justify-center gap-1">
                {t(`inbox.tab.${which}`)}
                {count > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                    {count}
                  </span>
                ) : null}
              </span>
              {tab === which ? <span className={styles.tabUnderline} /> : null}
            </button>
          );
        })}
      </div>
      {typeFilters.length > 0 ? (
        <div className={styles.appliedFilters}>
          {typeFilters.map((filter) => (
            <button
              className={styles.filterPill}
              key={filter}
              type="button"
              onClick={() => toggleTypeFilter(filter)}
            >
              {t(`inbox.filterType.${filter}`)}
              <XIcon aria-hidden className="size-3" />
            </button>
          ))}
          <button
            className={styles.filterPill}
            type="button"
            onClick={() => writeInboxParams({ types: null })}
          >
            <XIcon aria-hidden className="size-3" />
            {t('inbox.clearFilters')}
          </button>
        </div>
      ) : null}
      {partial ? (
        <div
          className="m-2 flex items-center gap-2 rounded-lg border border-border bg-muted p-3 text-sm"
          role="status"
        >
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          <span>{t('inbox.sourceUnavailable')}</span>
        </div>
      ) : null}
      {error ? (
        <div
          className="m-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">{t('inbox.loadFailed')}</span>
          <Button variant="ghost" onClick={() => void refresh()}>
            {tCommon('retry')}
          </Button>
        </div>
      ) : null}
      {listMode === 'loading' ? (
        <InboxListRowSkeleton />
      ) : error && cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, padding: 24 }}>
          <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
        </div>
      ) : listMode === 'empty' || listMode === 'partial-empty' ? (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, padding: 48 }}>
          <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            {createElement(InboxIcon, { 'className': 'size-8 shrink-0', 'aria-hidden': true })}
            <p>
              {displayOption
                ? t('inbox.empty')
                : tab === 'mentions'
                  ? t('inbox.emptyMentions')
                  : t('inbox.emptyAll')}
            </p>
          </div>
        </div>
      ) : (
        <>
          {visibleCards.map((card) => (
            <InboxListRow
              archivedView={displayOption === 'archived'}
              card={card}
              key={card.notificationId}
              selected={card.notificationId === selected?.notificationId}
              snoozedView={displayOption === 'snoozed'}
              onCustomSnooze={openCustomSnooze}
              onSelect={selectCard}
              onSnooze={(target, until) => void snoozeCard(target, until)}
              onToggleArchive={(target) => void toggleArchiveCard(target)}
              onToggleRead={(target) => void toggleReadCard(target)}
              onUnsnooze={(target) => void unsnoozeCard(target)}
            />
          ))}
          {hasMore || loadMoreError ? (
            <div
              className="flex flex-col items-center justify-center"
              style={{ padding: 12, flexDirection: 'column', gap: 8 }}
            >
              {loadMoreError ? (
                <span className="text-sm text-destructive">{t('inbox.loadFailed')}</span>
              ) : null}
              {hasMore ? (
                <Button disabled={loadingMore} variant="outline" onClick={() => void loadMore()}>
                  {loadingMore ? <Spinner /> : <></>}
                  {t('inbox.loadMore')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const detailPane = selected ? (
    selectedIssueTaskId ? (
      // Task-linked card — the pane IS the issue detail (Plane's peek), not a
      // bare notification card. The sticky header carries the issue
      // identifier plus pin/open actions; the notification's own context and
      // decision row stay above the shared issue body so the request remains
      // first-class for approval-type cards. IssueContent mounts directly in
      // the pane's scroll owner — no nested scroll host, no page chrome.
      <>
        <div className={styles.paneHeader}>
          {surface === 'detail' ? (
            <Button
              aria-label={tCommon('back')}
              size="icon"
              title={tCommon('back')}
              variant="ghost"
              onClick={() => writeInboxParams({ detail: null, item: null })}
            >
              {createElement(ChevronLeftIcon, { className: 'size-4 shrink-0' })}
            </Button>
          ) : null}
          <span className="truncate text-sm font-medium" style={{ minWidth: 0 }}>
            {selectedIssueIdentifier ?? titleFor(selected)}
          </span>
          <div
            className="flex flex-row"
            style={{ alignItems: 'center', justifyContent: 'flex-end', gap: 4, flex: 1 }}
          >
            <WorkFavoriteButton
              targetId={selectedIssueIdentifier}
              targetType="task"
              variant={'icon'}
            />
            {selectedOpenTarget ? (
              <Button
                aria-label={t('inbox.open')}
                size="icon"
                title={t('inbox.open')}
                variant="ghost"
                onClick={() => openTarget(selected)}
              >
                {createElement(ArrowUpRightIcon, { className: 'size-4 shrink-0' })}
              </Button>
            ) : null}
          </div>
        </div>
        <div className={styles.detail}>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <span className="text-base font-semibold">{titleFor(selected)}</span>
            <span className={cn('text-sm', styles.paneMeta)}>
              {dayjs(selected.lastActivityAt).fromNow()}
              {!selected.read ? ` · ${t('inbox.unread')}` : ''}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">{selected.content}</span>
          <div className={styles.divider} />
          {selected.nativeIntervention ? (
            <InboxNativeIntervention
              agent={selected.agent}
              key={selected.nativeIntervention.messageId}
              reference={selected.nativeIntervention}
              taskId={selectedIssueTaskId}
            />
          ) : null}
          {decisionVerbs.length > 0 ? (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {decisionVerbs.includes('submit_input') ? (
                <Input
                  aria-label={t('inbox.inputPlaceholder')}
                  placeholder={t('inbox.inputPlaceholder')}
                  value={inputDraft}
                  onChange={(event) => setInputDraft(event.target.value)}
                />
              ) : null}
              <div className="flex flex-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {decisionVerbs.includes('approve') ? (
                  <Button
                    disabled={pendingDecisions.has(`${selected.notificationId}:approve`)}
                    variant="default"
                    onClick={() => void decide(selected, 'approve')}
                  >
                    {pendingDecisions.has(`${selected.notificationId}:approve`) ? (
                      <Spinner />
                    ) : (
                      <></>
                    )}
                    {t('inbox.approve')}
                  </Button>
                ) : null}
                {decisionVerbs.includes('decline') ? (
                  <Button
                    disabled={pendingDecisions.has(`${selected.notificationId}:decline`)}
                    variant="outline"
                    onClick={() => void decide(selected, 'decline')}
                  >
                    {pendingDecisions.has(`${selected.notificationId}:decline`) ? (
                      <Spinner />
                    ) : (
                      <></>
                    )}
                    {t('inbox.decline')}
                  </Button>
                ) : null}
                {decisionVerbs.includes('cancel') ? (
                  <Button
                    disabled={pendingDecisions.has(`${selected.notificationId}:cancel`)}
                    variant="outline"
                    onClick={() => void decide(selected, 'cancel')}
                  >
                    {pendingDecisions.has(`${selected.notificationId}:cancel`) ? (
                      <Spinner />
                    ) : (
                      <></>
                    )}
                    {t('inbox.cancel')}
                  </Button>
                ) : null}
                {decisionVerbs.includes('submit_input') ? (
                  <Button
                    variant="default"
                    disabled={
                      pendingDecisions.has(`${selected.notificationId}:submit_input`) ||
                      !inputDraft.trim()
                    }
                    onClick={() =>
                      void decide(selected, 'submit_input', { text: inputDraft.trim() })
                    }
                  >
                    {pendingDecisions.has(`${selected.notificationId}:submit_input`) ? (
                      <Spinner />
                    ) : (
                      <></>
                    )}
                    {t('inbox.submitInput')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <Suspense
            fallback={
              <div aria-busy className="flex flex-col gap-2 p-3" role="status">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton className="h-10 w-full" key={index} />
                ))}
              </div>
            }
          >
            <LazyIssueContent taskId={selectedIssueTaskId} />
          </Suspense>
        </div>
      </>
    ) : (
      <div className={styles.detail}>
        {surface === 'detail' ? (
          <div className="flex flex-row">
            <Button
              variant="outline"
              onClick={() => writeInboxParams({ detail: null, item: null })}
            >
              {createElement(ChevronLeftIcon, { className: 'size-4 shrink-0' })}
              {tCommon('back')}
            </Button>
          </div>
        ) : null}
        <div className="flex flex-col" style={{ gap: 4 }}>
          <span className="text-base font-semibold">{titleFor(selected)}</span>
          <span className={cn('text-sm', styles.paneMeta)}>
            {dayjs(selected.lastActivityAt).fromNow()}
            {!selected.read ? ` · ${t('inbox.unread')}` : ''}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">{selected.content}</span>
        <div className={styles.divider} />
        <div className="flex flex-col" style={{ gap: 8 }}>
          {decisionVerbs.includes('submit_input') ? (
            <Input
              aria-label={t('inbox.inputPlaceholder')}
              placeholder={t('inbox.inputPlaceholder')}
              value={inputDraft}
              onChange={(event) => setInputDraft(event.target.value)}
            />
          ) : null}
          <div className="flex flex-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {decisionVerbs.includes('approve') ? (
              <Button
                disabled={pendingDecisions.has(`${selected.notificationId}:approve`)}
                variant="default"
                onClick={() => void decide(selected, 'approve')}
              >
                {pendingDecisions.has(`${selected.notificationId}:approve`) ? <Spinner /> : <></>}
                {t('inbox.approve')}
              </Button>
            ) : null}
            {decisionVerbs.includes('decline') ? (
              <Button
                disabled={pendingDecisions.has(`${selected.notificationId}:decline`)}
                variant="outline"
                onClick={() => void decide(selected, 'decline')}
              >
                {pendingDecisions.has(`${selected.notificationId}:decline`) ? <Spinner /> : <></>}
                {t('inbox.decline')}
              </Button>
            ) : null}
            {decisionVerbs.includes('cancel') ? (
              <Button
                disabled={pendingDecisions.has(`${selected.notificationId}:cancel`)}
                variant="outline"
                onClick={() => void decide(selected, 'cancel')}
              >
                {pendingDecisions.has(`${selected.notificationId}:cancel`) ? <Spinner /> : <></>}
                {t('inbox.cancel')}
              </Button>
            ) : null}
            {decisionVerbs.includes('submit_input') ? (
              <Button
                variant="default"
                disabled={
                  pendingDecisions.has(`${selected.notificationId}:submit_input`) ||
                  !inputDraft.trim()
                }
                onClick={() => void decide(selected, 'submit_input', { text: inputDraft.trim() })}
              >
                {pendingDecisions.has(`${selected.notificationId}:submit_input`) ? (
                  <Spinner />
                ) : (
                  <></>
                )}
                {t('inbox.submitInput')}
              </Button>
            ) : null}
            {selectedOpenTarget ? (
              <Button variant="outline" onClick={() => openTarget(selected)}>
                {createElement(ExternalLinkIcon, { className: 'size-4 shrink-0' })}
                {t('inbox.open')}
              </Button>
            ) : null}
            {decisionVerbs.length === 0 && !selectedOpenTarget ? (
              // Truthful empty state: the card offers no action the client can
              // perform, so no dead controls render.
              <span className="text-sm text-muted-foreground">{t('inbox.noActions')}</span>
            ) : null}
          </div>
        </div>
      </div>
    )
  ) : deepLink === 'failed' ? (
    // The id stays in the URL — it may still resolve — so the pane owns an
    // honest failure with retry instead of silently dropping the selection.
    <div className={styles.detail}>
      {surface === 'detail' ? (
        <div className="flex flex-row">
          <Button variant="outline" onClick={() => writeInboxParams({ detail: null, item: null })}>
            {createElement(ChevronLeftIcon, { className: 'size-4 shrink-0' })}
            {tCommon('back')}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col items-center justify-center" style={{ flex: 1, padding: 24 }}>
        <AsyncError
          error={fetchCardError}
          retrying={validatingCard}
          variant={'block'}
          onRetry={() => void retryFetchCard()}
        />
      </div>
    </div>
  ) : deepLink === 'loading' ? (
    // Deep link still resolving — a skeleton reads truer than "Select an
    // item", and it keeps the pane from flashing a wrong empty state.
    <div className={styles.detail}>
      <div aria-busy className="flex flex-col gap-2 p-3" role="status">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-10 w-full" key={index} />
        ))}
      </div>
    </div>
  ) : null;

  // Plane's right-pane empty state: "No notification selected — Select a
  // notification to view its details."
  const detailPlaceholder = (
    <div
      className={cn('flex flex-col items-center justify-center', styles.detailPlaceholder)}
      style={{ flex: 1, padding: 48 }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        {createElement(InboxIcon, {
          'aria-hidden': true,
          'className': 'size-8 shrink-0 text-muted-foreground',
        })}
        <p className="text-sm font-medium">{t('inbox.detailEmptyTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('inbox.detailEmptyDescription')}</p>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className={styles.stage}>
        <WorkSurfaceSplit
          detail={surface === 'split' ? (detailPane ?? detailPlaceholder) : undefined}
          list={listPane}
          listLabel={tCommon('tab.inbox')}
          listWidth={360}
          detailLabel={
            selected
              ? titleFor(selected)
              : deepLink === 'failed'
                ? t('inbox.loadFailed')
                : deepLink === 'loading'
                  ? t('inbox.loading')
                  : t('inbox.detailEmptyTitle')
          }
        />
        {surface === 'detail' && detailPane ? (
          <div
            aria-label={selected ? titleFor(selected) : t('inbox.detailEmptyTitle')}
            className={styles.detailOverlay}
          >
            {detailPane}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
});

WorkInboxPage.displayName = 'WorkInboxPage';

export default WorkInboxPage;
