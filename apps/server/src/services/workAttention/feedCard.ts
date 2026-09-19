import {
  ACTION_SOURCE_KINDS,
  type ActionSourceKind,
  type DecisionVerb,
  type NotificationFeedCard,
  safeWorkAttentionActionUrl,
  type TypedNavigationTarget,
} from '@orvilo/types';

import type { NotificationItem } from '@/database/schemas/notification';

const ACTION_KINDS = new Set<ActionSourceKind>(ACTION_SOURCE_KINDS);

const asActionKind = (value: string | null | undefined): ActionSourceKind | null =>
  value && ACTION_KINDS.has(value as ActionSourceKind) ? (value as ActionSourceKind) : null;

/**
 * Inbox may only open same-app relative paths or an allowlisted https host.
 * javascript:/data:/protocol-relative URLs fall back to the inbox itself.
 */
export const safeInboxActionUrl = safeWorkAttentionActionUrl;

const navigationFor = (row: NotificationItem): TypedNavigationTarget => {
  if (row.resourceType === 'task' && row.resourceId) {
    return { kind: 'task', taskId: row.resourceId };
  }
  if (row.resourceType === 'project' && row.resourceId) {
    return { kind: 'project', projectId: row.resourceId };
  }
  if (row.actionKind === 'workspace_ownership_transfer') {
    return { kind: 'url', url: '/settings/members' };
  }
  const url = safeInboxActionUrl(row.actionUrl);
  if (url) {
    return { kind: 'url', url };
  }
  return { kind: 'inbox' };
};

export interface LiveActionOverlay {
  outgoing?: boolean;
  sourceRevision?: number | string | null;
}

export const decisionVerbsFor = (
  kind: ActionSourceKind | null,
  outgoing = false,
): DecisionVerb[] => {
  if (!kind) return [];
  if (kind === 'acp_input') return ['submit_input'];
  if (kind === 'resource_transfer' || kind === 'workspace_ownership_transfer') {
    return outgoing ? ['cancel'] : ['approve', 'decline'];
  }
  return ['approve', 'decline'];
};

export const toFeedCard = (
  row: NotificationItem,
  live?: LiveActionOverlay,
): NotificationFeedCard => {
  const actionKind = asActionKind(row.actionKind);
  const unresolvedAction = row.kind === 'action' && !row.resolvedAt;
  return {
    actionRef:
      actionKind && row.actionRequestId
        ? {
            kind: actionKind,
            requestId: row.actionRequestId,
            ...(live?.sourceRevision !== undefined && live.sourceRevision !== null
              ? { sourceRevision: live.sourceRevision }
              : {}),
          }
        : null,
    activityVersion: row.activityVersion,
    availableActions: unresolvedAction
      ? ['archive', 'decide', 'open', 'snooze']
      : ['archive', 'open', 'snooze'],
    content: row.content,
    decisionVerbs: unresolvedAction ? decisionVerbsFor(actionKind, Boolean(live?.outgoing)) : [],
    kind: row.kind,
    lastActivityAt: (row.lastActivityAt ?? row.createdAt).toISOString(),
    notificationId: row.id,
    outgoing: Boolean(live?.outgoing),
    read: row.isRead,
    readVersion: row.readVersion,
    resourceId: row.resourceId,
    resourceType: row.resourceType,
    safeNavigation: navigationFor(row),
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    title: row.title,
    type: row.type,
  };
};

export const mapFeedWithLiveActions = (
  rows: NotificationItem[],
  pending: Array<{
    outgoing?: boolean;
    requestId: string;
    sourceRevision?: number | string | null;
  }>,
): NotificationFeedCard[] => {
  const live = new Map(pending.map((item) => [item.requestId, item]));
  return rows.map((row) =>
    toFeedCard(row, row.actionRequestId ? live.get(row.actionRequestId) : undefined),
  );
};

export const overlayLiveTitles = (
  cards: NotificationFeedCard[],
  titles: Map<string, string>,
): NotificationFeedCard[] =>
  cards.map((card) => {
    if (!card.resourceType || !card.resourceId) return card;
    const live = titles.get(`${card.resourceType}:${card.resourceId}`);
    return live ? { ...card, title: live } : card;
  });
