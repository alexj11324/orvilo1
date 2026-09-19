import type { DecisionVerb, NotificationFeedCard, VersionedDecision } from '@orvilo/types';

export const visibleDecisionVerbs = (card: NotificationFeedCard): DecisionVerb[] => {
  if (card.decisionVerbs?.length) return card.decisionVerbs;
  if (card.availableActions.includes('decide') && card.actionRef) return ['approve', 'decline'];
  return [];
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
