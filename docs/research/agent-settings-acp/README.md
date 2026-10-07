# Agent settings: ACP catalog and minimal surface

## Scope / evidence

- Candidate: `src/features/Settings/agents/AgentSettingsDetailPage.tsx`, `/settings/agents/:agentId`.
- User requests real ACP model names/IDs and removing unnecessary settings.
- Multica source inspected read-only 2026-10-06, revision `b4ca5b4a23e68b26292a680dca7689a952bb1cd5`.
- Profile/Execution source: <https://github.com/multica-ai/multica/blob/b4ca5b4a23e68b26292a680dca7689a952bb1cd5/packages/views/agents/components/agent-detail-inspector.tsx>
- Catalog UI source: <https://github.com/multica-ai/multica/blob/b4ca5b4a23e68b26292a680dca7689a952bb1cd5/packages/views/agents/components/model-dropdown.tsx>
- ACP discovery source: <https://github.com/multica-ai/multica/blob/b4ca5b4a23e68b26292a680dca7689a952bb1cd5/server/pkg/agent/models.go>
- Protocol: <https://agentclientprotocol.com/protocol/v1/session-config-options>
- ACP v1 `configOptions` category `model`, advertised `id`, options `{value,name}`, currentValue; setter uses configId=advertised id.
- Multica also exposes thinking/speed/concurrency and static/manual fallbacks. User's explicit minimal/ACP-only requirements narrow that reference.
- Rendered Multica geometry, responsive breakpoints and pixel parity unverified. No pixel parity claim.

## Existing actual flow / root cause

- Settings, CreateAgent, chat composer share `getHeteroSelectorCapability`.
- Claude Code and Codex model capabilities currently say `static`, selecting bundled aliases instead of runtime discovery.
- Existing `useModelCatalog` → `heterogeneousAgentCatalogService` → local IPC OR authenticated device RPC → `listHeterogeneousAgentModels`.
- Desktop uses inherited/proxy environment, configured command and effective target directory.
- CLI/Gateway invokes the same catalog function on the execution host.
- Model type union/router enum currently exclude Claude Code/Codex.
- Existing standard ACP session initialize → session/new parses real model option category before legacy adapter fields.
- Stored provider model is passed as initialModel; the same executor validates it against its runtime catalog and calls set_config_option/set_model before prompt.

## Frozen observable success / invariants

- Claude Code/Codex select catalog source through the shared registry; no bundled alias fallback in any consumer.
- Discover against the same effective device/local executor and configured executable/env/cwd as execution.
- ACP-only harness discovery failure returns an error; never invoke unsupported native --list-models as fallback.
- Picker displays exact advertised name, including prefixes; absent name uses full opaque ID.
- Unknown saved IDs remain visible verbatim; never relabel using model-bank aliases.
- Save the exact chosen runtime ID; remove conflicting authored model args with existing applyHeteroSelection.
- Preserve stored effort/mode/speed/permissions/cwd/access configuration unless user deliberately changes it elsewhere.
- Human-confirmed surface: name, runtime identity once, real ACP model, Device only for >=2 authorized matching installed runtimes, Use members list only.
- One eligible device resolves at write/admission and Device field hides; offline known matching remains a candidate, readiness is separate. Unknown capabilities never become installed/eligible assumptions.
- Use permissions are distinct from Manage; no teams/roles/Sharing toggle. Workspace Issue conversations readable by all workspace members; send/run/answer only by Agent Use permission.
- Do not mount Execution/CWD/mode/effort/speed/permission picker, Access/cloud/CLI options, Opening, Advanced, or Share controls.
- External models do not request unrelated builtin provider bindings.
- Real loading/error/retry/empty state remains visible; no fictional options substitute missing discovery.
- Existing RBAC/read-only binding/invalid-device/offline repair behavior remains intact.

## Verification / failures

- Focused existing React test: Claude Code receives synthetic novel runtime names/IDs, labels unchanged, saves actual ID, no mode/effort/speed controls.
- Catalog tests: actual dynamic array returned; ACP failure emits error and does not run unsupported fallback command.
- Type capability regression: both existing runtimes enumerate catalog; model selection strips conflicting flags without dropping unrelated args.
- Focused lint/tests; Typecheck remote CI only.
- Actual installed Claude ACP initialize/session/new, sanitized model ID/name/currentValue evidence, no prompt/credential output.
- Sole native collector exercises candidate Electron settings and saved model execution on authorized disposable fixture; author does not self-approve native acceptance.

## Exact ACP `default` versus inherited CLI configuration

The installed Claude ACP bridge 0.76.0 advertises ID `default` with name
`Default (recommended)`. Settings and Create keep that exact ID and encode its
explicit choice in the existing native args (`--model default`). A separate
UI-only inheritance value clears that argument; old saved `model: default`
without an explicit argument keeps its previous inheritance meaning.

An active first-send snapshot reproduced loss of the explicit argument. Its
minimal repair stores `heteroModelExplicit: true` in existing topic JSON metadata
and rehydrates transient `modelExplicit` when replaying that topic. No provider
field or database migration is added. Unmarked legacy topic defaults still clear
the Agent model argument.

Focused regressions cover both Claude Code and Codex argv, creation persistence,
inheritance reset, client metadata snapshot, server first-send and subsequent
execution, and ACP setter ordering with the advertised config ID. The cached
bridge no-prompt probe at 2026-10-06 22:29:23 UTC changed current model `opus` to
exact ID `default` through config ID `model`; the returned current ID was
`default`. This proves catalog and setter behavior, while candidate Electron
product acceptance and remote Typecheck remain separate gates.
