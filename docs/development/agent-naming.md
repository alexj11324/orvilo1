# Agent naming

New agents are named **deterministically**: the agent's own type name, numbered
on collision.

- **Heterogeneous agents** — the product title (`Claude Code`, `Codex`, ...).
  Shared-workspace agents keep the existing `Owner's Product` prefix so members
  can tell identical tools apart.
- **Builtin agents** — the agent's title when it has one, otherwise `Orvilo AI`.
- **Duplicates** — the bare name first, then `<name> 2`, `<name> 3`, ...
  (`numberedAgentName` in `packages/const/src/agentName.ts`, case-insensitive).

The scheme applies at all three naming sites: `createAgent`
(`src/store/agent/slices/agent/action.ts`), the profile header's "name it for
me" button (`useAutoName`), and the identity modal's suggestion button
(`AgentIdentityModal`).

The previous random personal-name generator (locale-scoped name pools that
could mint unrelated names like "苗") was removed — new agents are named after
what they are, not after a random person.
