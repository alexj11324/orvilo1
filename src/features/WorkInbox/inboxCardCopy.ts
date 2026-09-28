import type { NotificationFeedCard } from '@orvilo/types';

const SOURCE_TITLE_KEYS = {
  acp_input: 'inbox.source.acpInput',
  acp_intervention: 'inbox.source.acpIntervention',
  acp_permission: 'inbox.source.acpPermission',
  resource_transfer: 'inbox.source.resourceTransfer',
  task_review: 'inbox.source.taskReview',
  workspace_ownership_transfer: 'inbox.source.workspaceOwnershipTransfer',
} as const;

export const inboxCardTitleKey = (card: Pick<NotificationFeedCard, 'actionRef' | 'outgoing'>) => {
  const kind = card.actionRef?.kind;
  if (!kind) return null;
  if (kind === 'resource_transfer' && card.outgoing) {
    return 'inbox.source.resourceTransferOutgoing';
  }
  if (kind === 'workspace_ownership_transfer' && card.outgoing) {
    return 'inbox.source.workspaceOwnershipTransferOutgoing';
  }
  return SOURCE_TITLE_KEYS[kind] ?? null;
};
