'use client';
import { toast } from '@lobehub/ui/base-ui';
import type { DecisionVerb, NotificationFeedCard } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import {
  ArchiveIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  EyeIcon,
  InboxIcon,
  ListFilterIcon,
  MailOpenIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
  TimerOffIcon,
  TriangleAlertIcon,
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
import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs as TabsRoot, TabsList, TabsTrigger as TabsTab } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import SidebarDropdownMenu, {
  type SidebarDropdownMenuProps,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurfaceSplit } from '@/features/WorkSurface';
import { useIsMobile } from '@/hooks/useIsMobile';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { inboxKeys } from '@/libs/swr/keys';
import { notificationService } from '@/services/notification';
import { workAttentionService } from '@/services/workAttention';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useTaskStore } from '@/store/task';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import { formatInboxAge } from './inboxAge';
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
import InboxHeaderMenu from './InboxHeaderMenu';
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
  inboxIssueTaskId,
  inboxOpenTarget,
  type InboxSnoozePreset,
  resolveInboxFilterChip,
  resolveInboxTab,
  snoozeUntilForPreset,
} from './inboxOrganize';
import {
  inboxFeedKind,
  type InboxPriorityMode,
  inboxPriorityScopeKey,
  inboxScopeKindToken,
  resolveInboxPriority,
} from './inboxPriority';
import { inboxSurface, shouldMarkInboxCardRead } from './inboxSurface';
import { inboxCardIcon } from './notificationIcons';
import { INBOX_LIST_HOTKEY_OPTIONS, useInboxListKeyboard } from './useInboxListKeyboard';

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
  /* Linear's priority-inbox banner, inside the list column between the
     control row and the first notification row. Measured: a centred 12px/500
     prompt over two plain buttons in a 12px-radius card, 16/16/18 padding,
     8px margin. */
  banner: css`
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 10px;
    align-items: center;

    margin: 8px;
    padding-block: 16px 18px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    text-align: center;

    background: ${cssVar.colorFillQuaternary};
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
  avatarSlot: css`
    position: relative;
    flex: none;
    width: 32px;
    height: 32px;
  `,
  // Linear's notification-type badge: a 14px disc cut from the page
  // background, hanging off the avatar's bottom-right corner.
  typeBadge: css`
    position: absolute;
    inset-block-start: 19px;
    inset-inline-start: 21px;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 14px;
    height: 14px;
    border-radius: 50%;

    color: ${cssVar.colorText};

    background: ${cssVar.colorBgContainer};
  `,
  typeGlyph: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;
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
  // Read rows fade to the description colour as a whole — Linear's read state.
  readText: css`
    color: ${cssVar.colorTextDescription} !important;
  `,
  snippet: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-weight: 450;
    color: ${cssVar.colorTextSecondary};
  `,
  time: css`
    flex: none;
    font-weight: 450;
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
  /**
   * Task-linked cards get the reference's detail chrome: a sticky header row
   * carrying the issue identifier plus pin/open/overflow actions (Linear's
   * `ORV-115` · ★ · ⋯), while the issue body scrolls beneath it — the same
   * peek-header contract `MyWorkIssuePane` uses.
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
  const { i18n, t } = useTranslation('notification');
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
  // Toast dedupe for dead deep links — StrictMode re-runs effects, and a param
  // clear must never double-report.
  const deadLinkToastRef = useRef<string | null>(null);

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

  // Priority-inbox choice is persisted per (user, workspace) in SystemStatus:
  // there is no server field for it, so the local record is the source of
  // truth. Undecided scopes get the Linear-style onboarding banner; 'all'
  // collapses the tabs into one unified feed.
  const priorityScopeKey = inboxPriorityScopeKey({ userId, workspaceId });
  const priorityMode = useGlobalStore(systemStatusSelectors.inboxPriorityMode(priorityScopeKey));
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const { bannerVisible, priorityEnabled } = resolveInboxPriority(priorityMode);
  const setPriorityMode = useCallback(
    (mode: InboxPriorityMode) => {
      updateSystemStatus({ inboxPriorityMode: { [priorityScopeKey]: mode } });
    },
    [priorityScopeKey, updateSystemStatus],
  );
  // Linear's display-options "Show snoozed" — same per-(user, workspace)
  // persistence channel as the priority-inbox choice.
  const showSnoozed =
    useGlobalStore(systemStatusSelectors.inboxShowSnoozed(priorityScopeKey)) ?? false;
  const setShowSnoozed = useCallback(
    (show: boolean) => {
      updateSystemStatus({ inboxShowSnoozed: { [priorityScopeKey]: show } });
    },
    [priorityScopeKey, updateSystemStatus],
  );

  // `kind` is the feed bucket: the tab queries the priority classification
  // (pending action or unread mention) rather than the stored row kind. In
  // unified mode the request omits the bucket so the server returns one list.
  const kind = inboxFeedKind(priorityEnabled, tab);
  // The pager identity must still differ per logical feed — 'all' keeps the
  // unified tail from ever committing into a tab bucket's scope.
  const scopeKind = inboxScopeKindToken(priorityEnabled, tab);
  const filter = feedFilterForChip(filterChip);
  const { data, error, isLoading } = useClientDataSWR(
    inboxKeys.feed(workspaceId, kind, filter, showSnoozed ? 'snoozed' : undefined),
    () =>
      notificationService.feed({
        filter,
        includeSnoozed: showSnoozed || undefined,
        kind,
        limit: 50,
      }),
    { focusThrottleInterval: INBOX_FEED_FOCUS_THROTTLE_MS },
  );
  // Pages beyond the first stay client-side so a focus-triggered refetch of
  // page one never reorders rows the user already paged through. The pager is
  // bound to user + workspace + query fingerprint + request generation: a
  // page fetched under a stale scope can never commit into the new one.
  const feedScope = useMemo(
    () => inboxFeedScopeKey({ filter, kind: scopeKind, snoozed: showSnoozed, userId, workspaceId }),
    [filter, scopeKind, showSnoozed, userId, workspaceId],
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
      notificationService.feed({
        cursor,
        filter,
        includeSnoozed: showSnoozed || undefined,
        kind,
        limit: 50,
      }),
    );
  }, [data?.nextCursor, feedScope, filter, kind, pager, showSnoozed]);
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
        void mutate(inboxKeys.feed(workspaceId, kind, filter, showSnoozed ? 'snoozed' : undefined));
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
    showSnoozed,
    t,
    workspaceId,
  ]);

  const refresh = useCallback(async () => {
    await Promise.all([
      mutate(inboxKeys.feed(workspaceId, kind, filter, showSnoozed ? 'snoozed' : undefined)),
      mutate(inboxKeys.feedSummary(workspaceId)),
      mutate(inboxKeys.unreadCount(workspaceId)),
    ]);
  }, [filter, kind, showSnoozed, workspaceId]);

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
        // Snoozed cards hide until wake (Linear semantics): drop the tail copy
        // unless the snoozed filter or the show-snoozed toggle keeps it listed.
        if (filter === 'snoozed' || showSnoozed) {
          pager.updateCard(card.notificationId, (current) => ({
            ...current,
            snoozedUntil: until,
          }));
        } else {
          pager.removeCard(card.notificationId);
          // Same contract as archive/decide: a card that left this view
          // releases the selection instead of leaving the detail pane on a
          // row the list no longer holds.
          if (card.notificationId === selectedId) {
            readReceiptRetentionRef.current = null;
            writeInboxParams({ detail: null, item: null });
          }
        }
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [filter, organizeFailed, pager, refresh, selectedId, showSnoozed, writeInboxParams],
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

  // Secondary card actions live behind `…` — only actions the card actually
  // advertises make the list, and an empty list hides the trigger entirely.
  const detailMoreItems = useMemo<Exclude<SidebarDropdownMenuProps['items'], () => unknown>>(() => {
    if (!selected) return [];
    return [
      selected.availableActions.includes('archive')
        ? {
            icon: createElement(ArchiveIcon, { className: 'size-4 shrink-0' }),
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
            icon: createElement(TimerOffIcon, { className: 'size-4 shrink-0' }),
            key: 'snooze',
            label: t('inbox.snooze'),
          }
        : null,
      selected.read
        ? {
            icon: createElement(MailOpenIcon, { className: 'size-4 shrink-0' }),
            key: 'markUnread',
            label: t('inbox.markUnread'),
            onClick: () => void markCardUnread(selected),
          }
        : null,
    ].filter(Boolean);
  }, [archiveCard, markCardUnread, selected, snoozeCard, t]);

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

  // The header menu advertises ⌥U like the reference — bind it for real so
  // the hint is never a dead affordance.
  useHotkeys('alt+u', () => void markAllRead(), INBOX_LIST_HOTKEY_OPTIONS, [markAllRead]);

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
      <div className={cn('flex flex-col gap-1', styles.listHeader)}>
        <div className="flex items-center justify-between">
          {priorityEnabled ? (
            <TabsRoot
              className="min-w-0 flex-1"
              value={tab}
              onValueChange={(value) => writeInboxParams({ tab: value })}
            >
              <TabsList>
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
          ) : (
            <span className="ps-1 text-sm font-medium text-muted-foreground">{t('inbox.all')}</span>
          )}
          <div className="flex shrink-0 items-center">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('inbox.filterUnread')}
                    aria-pressed={filterChip === 'unread'}
                    size="icon"
                    variant={filterChip === 'unread' ? 'secondary' : 'ghost'}
                    onClick={() =>
                      writeInboxParams({ filter: filterChip === 'unread' ? 'all' : 'unread' })
                    }
                  />
                }
              >
                <EyeIcon />
              </TooltipTrigger>
              <TooltipContent>{t('inbox.filterUnread')}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button aria-label={t('inbox.addFilter')} size="icon" variant="ghost" />
                      }
                    />
                  }
                >
                  <ListFilterIcon />
                </TooltipTrigger>
                <TooltipContent>{t('inbox.addFilter')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                {INBOX_FILTER_CHIPS.map((chip) => (
                  <DropdownMenuItem key={chip} onClick={() => writeInboxParams({ filter: chip })}>
                    {chip === filterChip ? <CheckIcon /> : null}
                    {filterLabel(chip)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label={t('inbox.displayOptions')}
                          size="icon"
                          variant="ghost"
                        />
                      }
                    />
                  }
                >
                  <SlidersHorizontalIcon />
                </TooltipTrigger>
                <TooltipContent>{t('inbox.displayOptions')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={priorityEnabled}
                  closeOnClick={false}
                  onCheckedChange={(checked) => setPriorityMode(checked ? 'priority' : 'all')}
                >
                  {t('inbox.displayPriorityInbox')}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showSnoozed}
                  closeOnClick={false}
                  onCheckedChange={setShowSnoozed}
                >
                  {t('inbox.displayShowSnoozed')}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      {bannerVisible ? (
        <div className={styles.banner}>
          <span className="text-sm font-medium">{t('inbox.priorityBanner.title')}</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-px">
              <Button onClick={() => setPriorityMode('priority')}>
                {t('inbox.priorityBanner.keep')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button aria-label={t('inbox.displayOptions')} size="icon" />}
                >
                  <ChevronDownIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setPriorityMode('all')}>
                    {t('inbox.priorityBanner.disable')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button variant="outline" onClick={() => setPriorityMode('all')}>
              {t('inbox.priorityBanner.disable')}
            </Button>
          </div>
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
        <div aria-busy className="flex flex-col gap-2 p-3" role="status">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton className="h-10 w-full" key={index} />
          ))}
        </div>
      ) : error && cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, padding: 24 }}>
          <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
        </div>
      ) : listMode === 'empty' ? (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, padding: 48 }}>
          <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            {createElement(InboxIcon, { 'className': 'size-8 shrink-0', 'aria-hidden': true })}
            <p>{t('inbox.empty')}</p>
          </div>
        </div>
      ) : listMode === 'partial-empty' ? (
        <div className="flex flex-col items-center justify-center" style={{ flex: 1, padding: 48 }}>
          <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            {createElement(InboxIcon, { 'className': 'size-8 shrink-0', 'aria-hidden': true })}
            <p>{t('inbox.empty')}</p>
          </div>
        </div>
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
              <div className="flex flex-row" style={{ alignItems: 'center', gap: 10 }}>
                {card.actor || card.agent ? (
                  <span className={styles.avatarSlot}>
                    <Avatar
                      avatar={card.actor?.avatar ?? card.agent?.avatar}
                      background={card.agent?.backgroundColor}
                      name={card.actor?.name ?? card.agent?.name}
                      size={32}
                    />
                    <span aria-hidden data-inbox-type-badge className={styles.typeBadge}>
                      {createElement(inboxCardIcon(card), { className: 'size-3 shrink-0' })}
                    </span>
                  </span>
                ) : (
                  <span className={styles.typeGlyph}>
                    {createElement(inboxCardIcon(card), { className: 'size-4 shrink-0' })}
                  </span>
                )}
                <div className="flex flex-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <div className="flex flex-row" style={{ alignItems: 'center', gap: 6 }}>
                    {card.read ? null : <span className={styles.unreadDot} />}
                    <span
                      className={cn(
                        'text-sm font-medium truncate',
                        card.read ? styles.readText : undefined,
                      )}
                    >
                      {titleFor(card)}
                    </span>
                  </div>
                  <div
                    className="flex flex-row"
                    style={{ alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                  >
                    <span
                      className={cn('text-sm', cx(styles.snippet, card.read && styles.readText))}
                    >
                      {card.content}
                    </span>
                    <span
                      className={cn('text-sm', cx(styles.time, card.read && styles.readText))}
                      title={dayjs(card.lastActivityAt).format('LLL')}
                    >
                      {formatInboxAge(card.lastActivityAt, { locale: i18n.language })}
                    </span>
                  </div>
                </div>
              </div>
            </button>
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
      // Task-linked card — the pane IS the issue detail (Linear's inbox detail
      // surface), not a bare notification card. The sticky header carries the
      // issue identifier plus pin/open/overflow (the reference's `ORV-115` ·
      // ★ · ⋯ row); the notification's own context and decision row stay above
      // the shared issue body so the request remains first-class for
      // approval-type cards. IssueContent mounts directly in the pane's scroll
      // owner — no nested scroll host, no page chrome.
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
          <span className="text-sm font-medium truncate" style={{ minWidth: 0 }}>
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
            {detailMoreItems.length > 0 ? (
              <SidebarDropdownMenu items={detailMoreItems} placement={'bottomRight'}>
                <Button
                  aria-label={t('inbox.moreActions')}
                  size="icon"
                  title={t('inbox.moreActions')}
                  variant="ghost"
                >
                  {createElement(MoreHorizontalIcon, { className: 'size-4 shrink-0' })}
                </Button>
              </SidebarDropdownMenu>
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
            {detailMoreItems.length > 0 ? (
              <SidebarDropdownMenu items={detailMoreItems} placement={'bottomRight'}>
                <Button
                  aria-label={t('inbox.moreActions')}
                  size="icon"
                  title={t('inbox.moreActions')}
                  variant="ghost"
                >
                  {createElement(MoreHorizontalIcon, { className: 'size-4 shrink-0' })}
                </Button>
              </SidebarDropdownMenu>
            ) : null}
            {decisionVerbs.length === 0 && !selectedOpenTarget && detailMoreItems.length === 0 ? (
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

  const detailPlaceholder = (
    <div
      className={cn('flex flex-col items-center justify-center', styles.detailPlaceholder)}
      style={{ flex: 1, padding: 48 }}
    >
      <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        {createElement(InboxIcon, { 'className': 'size-8 shrink-0', 'aria-hidden': true })}
        <p>
          {listMode === 'list' && filterChip === 'all' && summary
            ? t('inbox.unreadCount', {
                // `unreadBadgeCount` is already the unique badge-worthy total —
                // correct for both the Priority tab and the unified list.
                count:
                  priorityEnabled && tab === 'other'
                    ? summary.unreadOtherCount
                    : summary.unreadBadgeCount,
              })
            : listMode === 'list'
              ? t('inbox.loadedCount', { count: visibleCards.length })
              : t('inbox.selectItem')}
        </p>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col" style={{ flex: 1, height: '100%' }}>
        <NavHeader
          left={
            <span className="text-sm font-medium" style={{ paddingInlineStart: 4 }}>
              {tCommon('tab.inbox')}
            </span>
          }
          right={
            <InboxHeaderMenu
              onDeleteAll={() => void archiveAll()}
              onMarkAllRead={() => void markAllRead()}
            />
          }
        />
        <div className={styles.stage}>
          <WorkSurfaceSplit
            detail={surface === 'split' ? (detailPane ?? detailPlaceholder) : undefined}
            list={listPane}
            listLabel={tCommon('tab.inbox')}
            listWidth={400}
            detailLabel={
              selected
                ? titleFor(selected)
                : deepLink === 'failed'
                  ? t('inbox.loadFailed')
                  : deepLink === 'loading'
                    ? t('inbox.loading')
                    : t('inbox.selectItem')
            }
          />
          {surface === 'detail' && detailPane ? (
            <div
              aria-label={selected ? titleFor(selected) : t('inbox.selectItem')}
              className={styles.detailOverlay}
            >
              {detailPane}
            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
});

WorkInboxPage.displayName = 'WorkInboxPage';

export default WorkInboxPage;
