import {
  ACTION_SOURCE_KINDS,
  type ActionSourceKind,
  type DecisionVerb,
  type NotificationFeedCard,
  type TypedNavigationTarget,
} from '@orvilo/types';

import type { NotificationItem } from '@/database/schemas/notification';

const ACTION_KINDS = new Set<ActionSourceKind>(ACTION_SOURCE_KINDS);

const asActionKind = (value: string | null | undefined): ActionSourceKind | null =>
  value && ACTION_KINDS.has(value as ActionSourceKind) ? (value as ActionSourceKind) : null;

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
  if (row.actionUrl) {
    return { kind: 'url', url: row.actionUrl };
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
