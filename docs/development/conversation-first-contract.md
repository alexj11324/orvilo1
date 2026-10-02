# Conversation-first contract pins

The conversation-first convergence turns the conversation — not the agent —
into the navigation unit. This file indexes the regression tests that pin
the converged contract so a later refactor fails loudly instead of silently
re-coupling conversation identity to agent identity.

## Workspace conversation feed

One workspace-wide list of every visible non-group topic, whatever agent
owns it. A row's `agentId` is weak metadata (display name + runtime status)
— never a fetch filter, and never model/provider fields on the feed surface.

| Pin                                                                         | Test                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Feed request: `scope:'workspace'`, no container ids, bounded `pageSize`     | `src/hooks/useFetchChatTopics.test.ts`                             |
| Cross-agent rows all surface regardless of `activeAgentId`                  | `src/store/chat/slices/topic/selectors.test.ts` (`currentTopics`)  |
| Rebound topic stays in the feed bucket after a handoff                      | `src/store/chat/slices/topic/action.test.ts` (`rebindTopicAgent`)  |
| Mobile row shape: weak fields only (`agentId`, `status`, `runStartedAt`, …) | `src/features/MobileHome/TopicListContent/mobileTopicRows.test.ts` |
| Agent label resolves name→title only (no model/provider)                    | `packages/types/src/agent/displayName.test.ts`                     |

## `lastUsedAgentId` — the only new-topic default source

Exactly three user actions may write it: an explicit composer pick, a send
that ran under an agent, and a completed mid-topic handoff. Background work
(run completions, feed reorders, inbox sync) must never move it.

| Pin                                                                                         | Test                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Blank-composer pick writes; Continue/Fork write; re-pick is a no-op                         | `src/features/ChatInput/ActionBar/Agent/index.test.tsx`                                   |
| Send-side writer: agent contexts write + consume `composerAgentId`; group sends never write | `src/features/Conversation/store/slices/message/action/recordSendAgentUsage.test.ts`      |
| Persisted value wins over feed order; background churn can't move it                        | `src/features/MobileHome/TopicListContent/useMobileTopics.test.ts` (`useLastUsedAgentId`) |

## Conversation identity

Drafts key on the conversation (`topic_<topicId>`; `topic_new` for the
blank composer, workspace-scoped). URLs key on the topic: `/chat/:topicId`
and `/chat/new` are canonical; legacy `/agent/:aid/:topicId` redirects.

| Pin                                                                           | Test                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `conversationDraftKey` per-topic isolation + blank-composer key               | `src/store/chat/utils/draftStorage.test.ts`                            |
| `LegacyAgentTopicRedirect` target resolution (query/hash, slug prefix)        | `src/spa/router/legacyAgentTopic.test.ts`                              |
| Navigation emits canonical URLs                                               | `src/features/AgentSidebar/Topic/hooks/useTopicNavigation.test.tsx`    |
| `TopicOwnerSync` binds `activeAgentId` from the topic row; `/chat/new` clears | `src/features/Conversation/TopicOwnerSync/resolveOwnerBinding.test.ts` |
| Every shared leaf segment reaches production (proxy matcher)                  | `src/features/Workspace/__tests__/proxyMatcher.test.ts`                |
| `/chat/*` pinned unserved on mobile (its own `agent/:aid` chat routes)        | `src/spa/router/mobileRouter.sharedLeaves.test.ts`                     |

## Handoff persistence

Continue reassigns execution only; Fork produces a new topic under the
target agent. `batchMoveTopics` is not part of either flow.

| Pin                                                                         | Test                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Continue → `updateTopic{agentId}` + `metadata.agentHandoffs` segment record | `src/store/chat/slices/topic/action.test.ts`                    |
| Fork → `cloneTopic(id, _, targetAgentId)`; original untouched               | `src/store/chat/slices/topic/action.test.ts` (`forkTopicAgent`) |
| Chip wiring: Continue no-navigate, Fork navigates to `/chat/tpc_*`          | `src/features/ChatInput/ActionBar/Agent/index.test.tsx`         |

## Send path

The optimistic topic row minted on first send carries `agentId`, so
`context.agentId` / `messageMapKey` never desyncs on `/chat/:topicId`
(the `0e4c87f1d` bug class).

| Pin                         | Test                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- |
| Minted row stamps `agentId` | `src/store/chat/slices/agentRun/actions/__tests__/conversationLifecycle.test.ts` |

## Mobile

The mobile 会话 tab reads the same cross-agent feed with a bounded first
page (`MOBILE_FEED_PAGE_SIZE = 40`, inside the 30–50 contract band; cursor
pagination is follow-up), and `Settings → Agents` stays inside the settings
tree (pinned by the shared `surfaces` router test).

| Pin                                                          | Test                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Bounded `queryTopics` first page + `lastUsedAgentId` reader  | `src/features/MobileHome/TopicListContent/useMobileTopics.test.ts` |
| `/settings/agents` stays under `settings/*` on every surface | `src/spa/router/reservedRootPaths.test.ts`                         |

E2e backstop: the `conversation-mgmt` feature exercises the whole loop end
to end (create → mint → navigate → list → rename/delete/switch), so unit
pins plus that suite cover the contract; route redirects are additionally
pinned at the unit level above.
