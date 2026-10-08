# Agent runtime brand avatars

Task assignees and the agent authors shown in task detail are identified by the
runtime the agent runs on (Codex, Claude Code, Orvilo, …), not by the editable
name or avatar. Renaming an agent or changing its avatar no longer changes the
mark that tells a reader which runtime did the work.

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
4. `AssigneeAvatar` (`src/features/AgentTasks/features/AssigneeAvatar.tsx`)
   renders `AgentRuntimeIcon` for a known runtime inside a `role="img"` wrapper
   labelled `Agent: <display name>`. A `null` runtime keeps the previous default
   avatar, so an unresolvable agent is never shown under a brand it may not use.

## Surfaces

Every `AssigneeAvatar` caller picks this up, which covers task lists, boards,
the create-task entries, the task detail assignee, and automation assignees.

In task detail, agent authors now go through the same component, keyed by
`author.id` (the agent id for `type: 'agent'` authors, as built by
`TaskService.resolveAuthors`):

- `CommentCard` — comment header avatar
- `TaskActivities` — `RowMark` on the activity rail
- `TaskRunReport` — report author
- `TopicCard` — run card avatar

Human authors keep their profile avatar and authorless rows keep their activity
icon.

## Not changed

- `src/components/AgentRuntimeIcon.tsx` still falls back to the Orvilo mark when
  `type` is empty, and `src/features/AgentRuntimeIcon` keeps its own rendering.
  Existing callers of both look the same as before.
- Avatars in conversations, the home inbox, Electron tabs, groups and the portal
  agent views are not part of this change.
