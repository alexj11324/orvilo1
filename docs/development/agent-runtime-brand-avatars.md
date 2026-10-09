# Agent runtime brand avatars

An Agent is always identified by the runtime it runs on (Codex, Claude Code,
Orvilo, …), never by name initials, an emoji, or its editable avatar. Renaming
an Agent or changing its avatar does not change the mark that tells a reader
which runtime did the work. Real user avatars and group identities keep their
own semantics.

## Identity chain

1. `AgentModel.queryAgents` (`packages/database/src/models/agent.ts`) projects
   `heterogeneousType` with `resolveAgentRuntimeType`, the same read migration
   the rest of the product uses. A stored `heterogeneousProvider.command` of
   `codex` resolves to `codex`; an agent with no runtime config resolves to
   `orvilo`. The raw `agencyConfig` and `model` still do not leave the model.
   The older `heteroType` field is unchanged and stays `undefined` for agents
   with no configured runtime.
2. `AvailableAgentItem.heterogeneousType` (`src/services/agent.ts`) types that
   field for the client.
3. `useAgentDisplayMeta` (`src/features/AgentTasks/shared/useAgentDisplayMeta.ts`)
   returns `runtimeType`:
   - the agent store config when the agent has been loaded;
   - otherwise the home sidebar row (`heterogeneousType`, or `orvilo` when the
     row is an agent with no saved runtime);
   - `orvilo` for the inbox agent;
   - `null` when nothing resolves the agent (deleted, or outside the viewer's
     scope).
4. `AssigneeAvatar` (`src/features/AgentTasks/features/AssigneeAvatar.tsx`) is
   the shared Agent identity mark. It renders `AgentRuntimeIcon` inside a
   `role="img"` wrapper labelled `Agent: <display name>`.
5. `AgentRuntimeIcon` (`src/components/AgentRuntimeIcon.tsx`) draws the Orvilo
   app icon for `orvilo`, the provider brand for a connectable runtime, and the
   unknown-runtime glyph (`CircleHelp`) for anything else, including an empty
   type. An Agent the viewer cannot resolve is therefore never shown under a
   brand it may not use. `src/features/AgentRuntimeIcon` re-exports the same
   component, so there is one rendering.

The home sidebar payload deliberately carries `heterogeneousType: null` for an
Agent with no saved runtime (onboarding uses that to tell connected harnesses
from the builtin engine). Render sites that draw a known Agent row straight
from that payload pass `heterogeneousType || 'orvilo'`, the same rule
`useAgentDisplayMeta` applies, so a builtin Agent shows the Orvilo mark rather
than the unknown glyph.

## Surfaces

Use `AssigneeAvatar agentId={…}` wherever an Agent id is in hand.

- Tasks: task lists, boards, create-task entries, the task detail assignee,
  automation assignees, and task-detail agent authors (`CommentCard`,
  `TaskActivities` `RowMark`, `TaskRunReport`, `TopicCard`), keyed by
  `author.id`.
- Conversation: message author avatar (`ChatItem/components/Avatar`, fed by
  `useAgentMeta`, which now returns `agentId`), compressed history rows, and
  group task rows (`GroupTasks/TaskItem/TaskTitle`).
- Home inbox: running tasks stack, topic rows, unread topics, goals rail,
  brief cards and the news list.
- Electron tab bar: an `/agent/:aid` tab resolves `meta.agentId` from the route
  and draws the runtime mark; group and page tabs are unchanged.
- Portal: agent detail title and body, thread header.
- Work gallery: agent filter chips and the card footer.
- Agent profile card and popup, global approval card.
- Command menu: `@` mention list, Ask AI list, selected/active Agent chips,
  the send-to-agent row and topic search results.
- Chat input `@` mention list, the quick chat Agent switcher, share image
  header, the Agent Builder and Page Copilot welcome, the "Ask Copilot" editor
  item, the workspace Agents panel and the connector "used by Agent" row.
- Agent pickers that draw sidebar rows directly: home sidebar Agent list, home
  Agent select, Agent settings list, Agents page, forward modals, Task Manager
  and Page Copilot Agent selectors.

Human authors keep their profile avatar, authorless rows keep their activity
icon, and groups keep the group avatar.

## Not changed

- Group surfaces that read members from the group session (group thread
  header, the group `@` member menu and mention popover) keep the member
  avatar, matching the source branch. Group member lists in Group settings are
  owned by the Group configuration change.
- The Agent avatar editor (`EditingPopover/AgentContent`) still edits the
  stored avatar field.
- Marketplace Agent cards, the shared Acceptance viewer, the internal link
  preview and the collaboration activity dock draw records that are not in the
  viewer's Agent store; they need a runtime type in their own payloads first.

## Workspace command context

The command palette resolves its active Agent from both `/agent/:id` and
`/:workspace/agent/:id` using the same Agent-context gate as its menu. The native
workspace route previously matched Agent context but lost the actor id, so it
showed a generic Agent label instead of the runtime mark. Group and other routes
keep their own context and never borrow an Agent id.
