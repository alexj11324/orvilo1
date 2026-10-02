/**
 * What the conversation-stable `/chat` routes bind into the stores.
 *
 * On `/agent/:aid/...` the URL's agent segment writes `activeAgentId` via
 * `useAgentIdStoreSync`; `/chat/:topicId` has no agent segment — the owner
 * comes from the topic row (`topic.agentId`), so a Continue handoff that
 * flips `topic.agentId` on the same row re-binds execution with no
 * navigation and no message/thread move.
 *
 * - `/chat/:topicId` — `activeAgentId` tracks the topic's `agentId` (a
 *   still-loading row binds nothing yet; the deep-link effect resolves it).
 * - `/chat/new` — `activeAgentId` stays cleared; the composer's config
 *   agent falls back to the explicit pick, then `lastUsedAgentId`, exactly
 *   like a fresh room.
 */
export const resolveOwnerBinding = (params: {
  composerAgentId?: string;
  lastUsedAgentId?: string | null;
  routeTopicId: string | null;
  topicAgentId?: string | null;
}): { activeAgentId?: string; configAgentId?: string } => {
  const { composerAgentId, lastUsedAgentId, routeTopicId, topicAgentId } = params;

  if (routeTopicId) {
    return { activeAgentId: topicAgentId ?? undefined, configAgentId: topicAgentId ?? undefined };
  }

  return {
    activeAgentId: undefined,
    configAgentId: composerAgentId ?? lastUsedAgentId,
  };
};
