# Agent interface and execution integration

The Agent sidebar has a Home destination, consistent disclosures, topic grouping controls in the menu, reserved hover actions, and searchable keyboard-accessible session history. The composer exposes Agent selection, voice and context-window actions; model and effort choices live in Agent configuration.

Execution controls distinguish the local computer from registered external devices, show current/open state, and dismiss device menus when their desktop tab becomes inactive. Cloud sandbox remains disabled by default and is checked by both the client and server.

ACP permission options come from the installed harness. The selected provider/config/value is saved on the conversation topic and applied before prompting through either local IPC or device dispatch. Discovery failure has an explicit retry. Unsupported choices and failed permission application stop execution.

Working-directory and worktree changes use the active conversation identity and topic overrides. Running, paused and cancelling operations block unsafe transitions. Admission pins new-topic execution choices; runtime session snapshots use the admitted directory and terminal result without overwriting sibling sessions.

First-login setup creates a real Agent before the workspace wizard, verifies a provider/model and execution device, and persists that Agent through workspace completion. Release acquisition and failed-send recovery are separate dependent layers; integration must preserve their regressions and later corrections.

Verify these connected behaviors in the same fixed Electron candidate before release. Shared component geometry CI, focused tests and remote Typecheck are supporting evidence; development and mock-provider runs do not prove public installer or model-provider acceptance.
