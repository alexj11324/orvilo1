# Last-used agent default (`lastUsedAgentId`)

`status.lastUsedAgentId` (persisted via `statusStorage`) is the **only** source
of truth for which agent a blank/new-topic composer targets. Conversation
ordering never feeds into it: a topic bubbling to the top of the feed because a
background run completed must not hand the next send to that agent.

## Resolution

- `src/features/ChatInput/hooks/useAgentId.ts` (shared by the desktop and mobile
  composer surfaces) resolves
  `composerAgentId || lastUsedAgentId || activeAgentId`.
- `src/features/Conversation/hooks/useAgentContext.ts` resolves an open
  conversation's agent as `topicId||threadId ? routeAgentId : composerAgentId ||
lastUsedAgentId || routeAgentId`, so an explicit pick retargets a pending send
  until the composer is consumed on send.

## Write points — the only three allowed

1. **Explicit pick on a blank composer** —
   `src/features/ChatInput/ActionBar/Agent/index.tsx` writes it when the user
   picks an agent while no topic is open.
2. **Send** — `src/features/Conversation/store/slices/message/action/sendMessage.ts`
   writes `targetContext.agentId` after a successful send in an agent (not
   group) context, and consumes `composerAgentId`.
3. **Mid-topic handoff** — the confirm path in
   `src/features/ChatInput/ActionBar/Agent/index.tsx` writes it after
   `rebindTopicAgent` succeeds.

Everything else must never write it: background run completion, topic
`updatedAt`/`sortUpdatedAt` churn, inbox/sync updates, and merely opening a
topic. Regression coverage lives in
`src/store/chat/slices/topic/action.test.ts` (`lastUsedAgentId contract`) and
`src/features/ChatInput/hooks/useAgentId.test.ts` (feed ordering is ignored).
