# CLI agent model catalog

How the model list for a CLI-backed Agent (Claude Code, Codex, OpenCode) is discovered, and what
happens when discovery fails.

## Sources

| Runtime     | Source                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| Claude Code | The vendor's own model list (Opus 5.5, Haiku 5.5 and the versioned ids). No bridge probe. |
| Codex       | `codex debug models --bundled`; falls back to a static list when the scan fails.          |
| OpenCode    | `opencode models --verbose`, then `opencode models`.                                      |

## Failure behavior

- A failed scan returns an empty list and keeps the runtime's own default model.
- Creating an Agent never waits on a successful catalog. The model field stays optional and the
  Agent is created with the runtime default.

## Creation in a workspace

An Agent created in a workspace is public, and it can bind the caller's own computer as its
execution device. The device and model are fixed in the Agent's settings afterwards; see
[agent-settings-convergence.md](./agent-settings-convergence.md).
