# Group chat UX model

Group chats are generic rooms containing agents and humans together. This note
records the UX contract; implementation details live in `src/routes/(main)/group`
and `src/features/HomeSidebar`.

## Invariants

- **Creation is purpose-free.** The create entry (`Agents → + → New Group`, the
  sidebar `+` menu, the `/group` index empty state) calls `createGroup` directly
  and never requires a use-case description. AI template generation stays
  available only as the secondary "Generate from a description" affordance
  (`newGroupChatFromDescription`), which submits the description to the group
  agent builder without gating entry.
- **Entry lands in the conversation.** All create paths navigate to
  `/group/:gid`, never `/group/:gid/profile`. A freshly created group has a
  supervisor agent, so the topic composer is immediately usable. The profile
  editor stays reachable from the group sidebar and settings.
- **No dead layout regions.** The group profile canvas only mounts when there
  is content or the user opts in via the dashed "Add instructions" affordance;
  nothing renders as a large empty panel.
- **Agent selectors, not model selectors.** Outside the agent settings/profile
  editing flow, surfaces expose agent pickers (the ChatInput ActionBar `agent`
  chip). The raw model dropdown is reserved for an agent's own settings.
  Surfaces that switched: group topic composer `rightActions`, the create-agent
  / create-group modal `RIGHT_ACTIONS`, the ActionBar search controls
  (`FCSearchModel` + `ModelBuiltinSearch` sibling removed), and the
  AgentTaskManager / PageEditor copilot headers.
- **Top-level sidebar entry.** `group` is a fixed primary sidebar key
  (`DEFAULT_SIDEBAR_ITEMS`, `FIXED_PRIMARY_KEYS`, `CORE_KEYS`,
  `SIDEBAR_SECTIONS`). `/group` renders `GroupIndex`: it redirects into the most
  recently active group, or shows the empty state with both create affordances.
  The group nav panel key only resolves below `/group/:gid`; the bare `/group`
  path keeps the global nav (`resolveNavPanelKey` → `home`).

## Topic-centric agent workspace

The conversation (topic) is the work unit; the agent is an execution attribute
of a conversation. There is no agent rail or separate workspace shell — the
existing topic list sidebar and the composer agent selector carry the model.

- **Sidebar stays the topic list.** Topic rows show the bound agent as weak
  second-line metadata (`● <name>`) only when it differs from the row's
  context agent (`TopicItem` `agentId` prop → `boundAgentNode`). The Agent
  Profile and Tasks entries were removed from the agent sidebar nav; the
  `/agent/:aid/tasks` route still exists but no longer has a nav affordance.
- **Agent binding.** A new topic binds `agentId` on first send and the send
  persists `systemStatus.lastUsedAgentId`, which the blank composer then
  defaults to (`useAgentId`: `composerAgentId → lastUsedAgentId → route
agent`). The composer store's `composerAgentId` is a transient pre-bind pick
  cleared on send-consumption and route-agent change.
- **Mid-conversation switch.** The composer agent selector stays live on an
  open topic: switching confirms, carries the draft across message-map keys,
  calls `rebindTopicAgent` (rebind first, then append
  `metadata.agentHandoffs`; a failed marker write does not roll the switch
  back), and navigates in place. `buildChatRows` interleaves UI-only
  `agentHandoff` marker rows at the message boundary each handoff's `at`
  falls on — a visible separator, no handoff semantics.
- **Config exile.** Per-agent configuration lives under
  `Settings → Agents` (`SettingsTabs.Agents`, `/settings/agents/:id`) which
  embeds the full profile surface; `/agent/:aid/profile` redirects there and
  `useOpenChatSettings` lands on it directly. Model pickers remain allowed
  only inside that settings surface.

## Out of scope

Broadcast/orchestrator backend contracts, heterogeneous/CLI agents in groups,
and per-agent model configuration inside agent settings are unchanged.
