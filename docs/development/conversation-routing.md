# Conversation-stable routing: `/chat/:topicId`

The conversation is the navigation unit. Its URL keys on the topic alone —
`/chat/:topicId` — and `/chat/new` is the blank composer. The agent is never
in the conversation URL, so a Continue handoff (which flips
`topics.agent_id`, see [conversation-handoffs.md](./conversation-handoffs.md))
never navigates containers and never moves messages or threads.

## Route shape

| URL                             | Resolves to                                                              |
| ------------------------------- | ------------------------------------------------------------------------ |
| `/chat/new`                     | Blank composer (`conversationChatElement`)                               |
| `/chat/:topicId`                | Conversation for that topic, regardless of owner agent                   |
| `/chat`                         | Redirects to `/chat/new`                                                 |
| `/agent/:aid/:topicId` (legacy) | `LegacyAgentTopicRedirect` → `/chat/:topicId` (preserves `?thread=`/`#`) |
| `/agent/:aid`                   | Blank composer under the agent layout (unchanged)                        |

Both trees also exist under `/:workspaceSlug` — `chat` is in
`WORKSPACE_MIRRORED_FIRST_SEGMENTS` and `RESERVED_FIRST_SEGMENTS`, so the
workspace-aware helpers prefix it and the slug guard treats it as reserved.

## Who binds the agent

`/agent/:aid` writes `activeAgentId` from the URL segment. `/chat` has no
agent segment: `TopicOwnerSync` (`src/features/Conversation/TopicOwnerSync`)
binds `useChatStore.activeAgentId` **and** `useAgentStore.activeAgentId` to
`topic.agentId` (deep links fetch `topicService.getTopicDetail` once), and
hydrates the agent config through `useInitAgentConfig`. When a Continue
handoff flips `topic.agentId`, the selector re-binds execution in place —
same URL, same message list, new owner.

On `/chat/new`, `activeAgentId` clears and the composer falls back to the
explicit pick / `lastUsedAgentId` chain, exactly like a fresh room.

## Route-sync path builders

`useChatRouteSync` accepts `getConversationPath` / `getTopicPath` overrides.
`/chat` passes builders that emit canonical URLs (ignoring the agent id), so
store→URL write-backs (send creating a new topic, scope resets) keep the
address bar canonical instead of re-materializing an agent segment. The
agent-scoped defaults (`AGENT_CHAT_*`) remain for `/agent/:aid` pages, which
still render for agent-only surfaces and legacy entries until the call-site
sweep lands.

## Drafts

`conversationDraftKey` (`src/features/ChatInput/draftStorage.ts`) resolves:
topic open → `topic_<topicId>`; blank composer → `topic_new` (workspace);
thread/group contexts keep their existing key. `carryDraftToKey` was removed
— no flow moves drafts between keys anymore.

## Contract pins

The regression suite pinning this contract — feed semantics, `lastUsedAgentId`
write points, routing, handoff persistence, send-path and mobile bounds —
is indexed in [conversation-first-contract.md](./conversation-first-contract.md).
