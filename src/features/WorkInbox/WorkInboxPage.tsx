'use client';

import { Center, Empty, Flexbox, Icon, Input, Tooltip } from '@lobehub/ui';
import {
  ActionIcon,
  Alert,
  Button,
  type DropdownItem,
  DropdownMenu,
  SplitButton,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { DecisionVerb, NotificationFeedCard } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ArchiveIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  EyeIcon,
  InboxIcon,
  ListFilterIcon,
  MailIcon,
  MailOpenIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
  TimerOffIcon,
} from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
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
import { compactInboxTime } from '@/utils/compactRelativeTime';

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
  inboxCardActionFlags,
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
  /* Linear-style onboarding region: sits inside the list column between the
     control row and the first notification row. */
  banner: css`
    flex: none;

    margin: 12px;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

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
  /**
   * Linear row hover affordances: quick actions surface over the row's right
   * edge (covering the timestamp) only while the row is hovered or an action
   * inside holds focus. The wrapper owns the reveal because the actions are
   * siblings of the row <button> — nested buttons inside it would be invalid.
   */
  rowWrap: css`
    position: relative;

    &:hover .work-inbox-row-actions,
    &:focus-within .work-inbox-row-actions {
      pointer-events: auto;
      opacity: 1;
    }

    &:hover .work-inbox-row-time {
      opacity: 0;
    }
  `,
  rowActions: css`
    pointer-events: none;

    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: 10px;
    transform: translateY(-50%);

    display: flex;
    gap: 2px;
    align-items: center;

    padding-block: 2px;
    padding-inline: 2px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    opacity: 0;
    background: ${cssVar.colorBgElevated};

    transition: opacity ${cssVar.motionDurationFast};
  `,
  /* Title must shrink inside the flex row so the trailing type glyph and the
     unread dot keep their slots instead of being pushed out by long names. */
  rowTitle: css`
    flex: 1;
    min-width: 0;
  `,
  /* Linear trails the notification-type glyph at the title line's right edge
     (colored 14px icon). Actor rows keep the avatar as the leading anchor, so
     the kind signal needs this trailing slot; no-actor rows already show the
     glyph as their leading element. */
  typeTail: css`
    display: flex;
    flex: none;
    align-items: center;
    color: ${cssVar.colorTextSecondary};
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

    background: ${cssVar.colorBgLayout};
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

  // Row-hover "Mark as read" — same observed-version receipt as the selection
  // path, minus the selection bookkeeping: the card may not be the open one.
  const markCardRead = useCallback(
    async (card: NotificationFeedCard) => {
      try {
        await notificationService.markReadObserved(card.notificationId, card.activityVersion);
        // A manual receipt on the open card must not be re-sent by the
        // selection effect — arm the same suppression the unread path uses.
        const suppression = armInboxReadReceiptSuppression({
          activityVersion: card.activityVersion,
          notificationId: card.notificationId,
          scope: feedScope,
          selectedId,
        });
        if (suppression) readReceiptAttemptRef.current = suppression;
        // Whether the row still satisfies the current view after the read:
        // the Unread filter drops read rows outright, and in the Priority tab
        // only unresolved actions keep their seat — a read mention moves to
        // Other. Page-one refresh alone cannot re-rank paginated tails, so
        // evict the card client-side.
        const stillVisible =
          filterChip !== 'unread' && !(kind === 'priority' && card.kind !== 'action');
        if (stillVisible) {
          pager.updateCard(card.notificationId, (current) => ({
            ...current,
            read: true,
            readVersion: current.readVersion + 1,
          }));
        } else {
          pager.removeCard(card.notificationId);
        }
        void mutate(inboxKeys.feedCard(workspaceId, card.notificationId));
        await refresh();
      } catch {
        organizeFailed();
      }
    },
    [feedScope, filterChip, kind, organizeFailed, pager, refresh, selectedId, workspaceId],
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

  // Snooze presets are shared by the detail `…` submenu, the pane-header clock
  // button, and the row-hover clock — one builder keeps them identical.
  const snoozeMenuItems = useCallback(
    (card: NotificationFeedCard): DropdownItem[] =>
      INBOX_SNOOZE_PRESETS.map((preset) => ({
        key: `snooze-${preset}`,
        label: t(`inbox.snoozePreset.${preset}`),
        onClick: () => void snoozeCard(card, preset),
      })),
    [snoozeCard, t],
  );

  // Secondary card actions live behind `…` — only actions the card actually
  // advertises make the list, and an empty list hides the trigger entirely.
  const detailMoreItems = useMemo(() => {
    if (!selected) return [] as DropdownItem[];
    const flags = inboxCardActionFlags(selected);
    return [
      flags.archive
        ? {
            icon: <Icon icon={ArchiveIcon} />,
            key: 'archive',
            label: t('inbox.archive'),
            onClick: () => void archiveCard(selected),
          }
        : null,
      flags.snooze
        ? {
            // Pick an absolute moment, not a bare "4h" —
            // every preset resolves against local time.
            children: snoozeMenuItems(selected),
            icon: <Icon icon={TimerOffIcon} />,
            key: 'snooze',
            label: t('inbox.snooze'),
          }
        : null,
      flags.markUnread
        ? {
            icon: <Icon icon={MailOpenIcon} />,
            key: 'markUnread',
            label: t('inbox.markUnread'),
            onClick: () => void markCardUnread(selected),
          }
        : null,
    ].filter(Boolean) as DropdownItem[];
  }, [archiveCard, markCardUnread, selected, snoozeMenuItems, t]);

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
      <Flexbox className={styles.listHeader} gap={4}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          {priorityEnabled ? (
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
          ) : (
            // Unified mode (Linear's "Disable"): no Priority/Other segments —
            // one list over the whole feed.
            <Text fontSize={13} style={{ paddingInlineStart: 4 }} type={'secondary'} weight={500}>
              {t('inbox.all')}
            </Text>
          )}
          <Flexbox horizontal align={'center'} flex={'none'}>
            <Tooltip title={t('inbox.filterUnread')}>
              <ActionIcon
                active={filterChip === 'unread'}
                icon={EyeIcon}
                size={'small'}
                style={{ borderRadius: 9999 }}
                onClick={() =>
                  writeInboxParams({ filter: filterChip === 'unread' ? 'all' : 'unread' })
                }
              />
            </Tooltip>
            <DropdownMenu
              placement={'bottomRight'}
              items={INBOX_FILTER_CHIPS.map((chip) => ({
                icon: chip === filterChip ? <Icon icon={CheckIcon} size={14} /> : undefined,
                key: chip,
                label: filterLabel(chip),
                onClick: () => writeInboxParams({ filter: chip }),
              }))}
            >
              <Tooltip title={t('inbox.addFilter')}>
                <ActionIcon icon={ListFilterIcon} size={'small'} style={{ borderRadius: 9999 }} />
              </Tooltip>
            </DropdownMenu>
            <DropdownMenu
              placement={'bottomRight'}
              items={[
                {
                  checked: priorityEnabled,
                  closeOnClick: false,
                  key: 'priorityInbox',
                  label: t('inbox.displayPriorityInbox'),
                  onCheckedChange: (checked: boolean) =>
                    setPriorityMode(checked ? 'priority' : 'all'),
                  type: 'switch',
                },
                {
                  checked: showSnoozed,
                  closeOnClick: false,
                  key: 'showSnoozed',
                  label: t('inbox.displayShowSnoozed'),
                  onCheckedChange: (checked: boolean) => setShowSnoozed(checked),
                  type: 'switch',
                },
                // Linear's unread-first ordering still has no backend support
                // here — omitted rather than faked.
              ]}
            >
              <Tooltip title={t('inbox.displayOptions')}>
                <ActionIcon
                  icon={SlidersHorizontalIcon}
                  size={'small'}
                  style={{ borderRadius: 9999 }}
                />
              </Tooltip>
            </DropdownMenu>
          </Flexbox>
        </Flexbox>
      </Flexbox>
      {bannerVisible ? (
        <div className={styles.banner}>
          <Text fontSize={13} weight={500}>
            {t('inbox.priorityBanner.title')}
          </Text>
          <Flexbox horizontal align={'center'} gap={8} style={{ marginTop: 10 }}>
            <SplitButton size={'small'} type={'primary'}>
              <SplitButton.Main onClick={() => setPriorityMode('priority')}>
                {t('inbox.priorityBanner.keep')}
              </SplitButton.Main>
              <SplitButton.Menu
                items={[
                  {
                    key: 'disable',
                    label: t('inbox.priorityBanner.disable'),
                    onClick: () => setPriorityMode('all'),
                  },
                ]}
              />
            </SplitButton>
            <Button size={'small'} onClick={() => setPriorityMode('all')}>
              {t('inbox.priorityBanner.disable')}
            </Button>
          </Flexbox>
        </div>
      ) : null}
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
          <div role={'list'}>
            {visibleCards.map((card) => {
              const cardActions = inboxCardActionFlags(card);
              return (
                <div className={styles.rowWrap} key={card.notificationId} role={'listitem'}>
                  <button
                    className={styles.row}
                    data-active={card.notificationId === selected?.notificationId}
                    data-inbox-id={card.notificationId}
                    type="button"
                    aria-current={
                      card.notificationId === selected?.notificationId ? 'true' : undefined
                    }
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
                          <Text ellipsis className={styles.rowTitle} fontSize={13} weight={500}>
                            {titleFor(card)}
                          </Text>
                          {card.actor || card.agent ? (
                            <span className={styles.typeTail}>
                              <Icon icon={inboxCardIcon(card)} size={14} />
                            </span>
                          ) : null}
                        </Flexbox>
                        <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
                          <Text className={styles.snippet} fontSize={12}>
                            {card.content}
                          </Text>
                          <Text className={`${styles.time} work-inbox-row-time`} fontSize={12}>
                            {compactInboxTime(card.lastActivityAt)}
                          </Text>
                        </Flexbox>
                      </Flexbox>
                    </Flexbox>
                  </button>
                  <span className={`${styles.rowActions} work-inbox-row-actions`}>
                    {cardActions.markRead ? (
                      <ActionIcon
                        icon={MailIcon}
                        size={'small'}
                        title={t('inbox.markRead')}
                        onClick={() => void markCardRead(card)}
                      />
                    ) : null}
                    {cardActions.markUnread ? (
                      <ActionIcon
                        icon={MailOpenIcon}
                        size={'small'}
                        title={t('inbox.markUnread')}
                        onClick={() => void markCardUnread(card)}
                      />
                    ) : null}
                    {cardActions.snooze ? (
                      <DropdownMenu items={snoozeMenuItems(card)} placement={'bottomRight'}>
                        <ActionIcon icon={TimerOffIcon} size={'small'} title={t('inbox.snooze')} />
                      </DropdownMenu>
                    ) : null}
                    {cardActions.archive ? (
                      <ActionIcon
                        icon={ArchiveIcon}
                        size={'small'}
                        title={t('inbox.archive')}
                        onClick={() => void archiveCard(card)}
                      />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
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
          {!hasMore && summary ? (
            <Center padding={12}>
              <Text fontSize={12} type={'secondary'}>
                {t('inbox.unreadCount', {
                  count:
                    priorityEnabled && tab === 'other'
                      ? summary.unreadOtherCount
                      : summary.unreadBadgeCount,
                })}
              </Text>
            </Center>
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
      // ★ · ⋯ row). IssueContent mounts directly in the pane's scroll
      // owner — no nested scroll host, no page chrome.
      <>
        <div className={styles.paneHeader}>
          {surface === 'detail' ? (
            <ActionIcon
              icon={ChevronLeftIcon}
              size={'small'}
              title={tCommon('back')}
              onClick={() => writeInboxParams({ detail: null, item: null })}
            />
          ) : null}
          <Text ellipsis fontSize={13} style={{ minWidth: 0 }} weight={500}>
            {selectedIssueIdentifier ?? titleFor(selected)}
          </Text>
          <Flexbox horizontal align={'center'} flex={1} gap={4} justify={'flex-end'}>
            <WorkFavoriteButton
              targetId={selectedIssueIdentifier}
              targetType="task"
              variant={'icon'}
            />
            {selectedOpenTarget ? (
              <ActionIcon
                icon={ArrowUpRightIcon}
                size={'small'}
                title={t('inbox.open')}
                onClick={() => openTarget(selected)}
              />
            ) : null}
            {/*
             * Linear's pane header carries the notification's organize actions
             * as standalone icons (snooze clock + archive tray) ahead of the
             * overflow `⋯` — not hidden two clicks deep. Same capability gating
             * as the row-hover strip: unavailable actions simply don't render.
             */}
            {inboxCardActionFlags(selected).snooze ? (
              <DropdownMenu items={snoozeMenuItems(selected)} placement={'bottomRight'}>
                <ActionIcon icon={TimerOffIcon} size={'small'} title={t('inbox.snooze')} />
              </DropdownMenu>
            ) : null}
            {inboxCardActionFlags(selected).archive ? (
              <ActionIcon
                icon={ArchiveIcon}
                size={'small'}
                title={t('inbox.archive')}
                onClick={() => void archiveCard(selected)}
              />
            ) : null}
            {detailMoreItems.length > 0 ? (
              <DropdownMenu items={detailMoreItems} placement={'bottomRight'}>
                <ActionIcon
                  icon={MoreHorizontalIcon}
                  size={'small'}
                  title={t('inbox.moreActions')}
                />
              </DropdownMenu>
            ) : null}
          </Flexbox>
        </div>
        <div className={styles.detail}>
          <Suspense fallback={<SkeletonList padding={8} rows={4} />}>
            <LazyIssueContent taskId={selectedIssueTaskId} />
          </Suspense>
        </div>
      </>
    ) : (
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
            {compactInboxTime(selected.lastActivityAt)}
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
            {selectedOpenTarget ? (
              <Button icon={ExternalLinkIcon} onClick={() => openTarget(selected)}>
                {t('inbox.open')}
              </Button>
            ) : null}
            {/* Same standalone organize icons as the task pane header — a
                card's snooze/archive affordance doesn't depend on its kind. */}
            {inboxCardActionFlags(selected).snooze ? (
              <DropdownMenu items={snoozeMenuItems(selected)} placement={'bottomRight'}>
                <ActionIcon icon={TimerOffIcon} size={'small'} title={t('inbox.snooze')} />
              </DropdownMenu>
            ) : null}
            {inboxCardActionFlags(selected).archive ? (
              <ActionIcon
                icon={ArchiveIcon}
                size={'small'}
                title={t('inbox.archive')}
                onClick={() => void archiveCard(selected)}
              />
            ) : null}
            {detailMoreItems.length > 0 ? (
              <DropdownMenu items={detailMoreItems} placement={'bottomRight'}>
                <ActionIcon icon={MoreHorizontalIcon} title={t('inbox.moreActions')} />
              </DropdownMenu>
            ) : null}
            {decisionVerbs.length === 0 && !selectedOpenTarget && detailMoreItems.length === 0 ? (
              // Truthful empty state: the card offers no action the client can
              // perform, so no dead controls render.
              <Text fontSize={12} type={'secondary'}>
                {t('inbox.noActions')}
              </Text>
            ) : null}
          </Flexbox>
        </Flexbox>
      </div>
    )
  ) : deepLink === 'failed' ? (
    // The id stays in the URL — it may still resolve — so the pane owns an
    // honest failure with retry instead of silently dropping the selection.
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
      <Center flex={1} padding={24}>
        <AsyncError
          error={fetchCardError}
          retrying={validatingCard}
          variant={'block'}
          onRetry={() => void retryFetchCard()}
        />
      </Center>
    </div>
  ) : deepLink === 'loading' ? (
    // Deep link still resolving — a skeleton reads truer than "Select an
    // item", and it keeps the pane from flashing a wrong empty state.
    <div className={styles.detail}>
      <SkeletonList padding={8} rows={6} />
    </div>
  ) : null;

  const detailPlaceholder = (
    <Center className={styles.detailPlaceholder} flex={1} padding={48}>
      <Empty
        icon={InboxIcon}
        description={
          listMode === 'list' && filterChip === 'all' && summary
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
    </Flexbox>
  );
});

WorkInboxPage.displayName = 'WorkInboxPage';

export default WorkInboxPage;
