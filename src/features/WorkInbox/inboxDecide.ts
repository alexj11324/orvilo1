import type { DecisionVerb, NotificationFeedCard, VersionedDecision } from '@orvilo/types';

export const visibleDecisionVerbs = (card: NotificationFeedCard): DecisionVerb[] => {
  if (card.decisionVerbs?.length) return card.decisionVerbs;
  if (card.availableActions.includes('decide') && card.actionRef) return ['approve', 'decline'];
  return [];
};

/**
 * The identity a card's actionRef binds drafts and decisions to: request id
 * plus the REQUEST's own versions (execution generation / source revision) —
 * never the notification's `activityVersion`, which bumps on any update.
 */
export const inboxActionIdentity = (
  card: NotificationFeedCard,
): {
  executionGeneration: number | null;
  requestId: string;
  sourceRevision: number | string | null;
} | null => {
  if (!card.actionRef) return null;
  return {
    executionGeneration: card.actionRef.executionGeneration ?? null,
    requestId: card.actionRef.requestId,
    sourceRevision: card.actionRef.sourceRevision ?? null,
  };
};

export const versionedDecisionFromCard = (
  card: NotificationFeedCard,
  decision: DecisionVerb,
  options: { idempotencyKey: string; inputPayload?: Record<string, unknown> },
): VersionedDecision | null => {
  if (!card.actionRef) return null;
  return {
    actionRef: card.actionRef,
    decision,
    expectedSourceRevision: card.actionRef.sourceRevision ?? null,
    idempotencyKey: options.idempotencyKey,
    ...(options.inputPayload ? { inputPayload: options.inputPayload } : {}),
  };
};
