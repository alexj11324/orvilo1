# Agent creation admission — frozen WIP

Source checkpoint: `808048477c9ad158fcaf77622f33d196df617108`. Integrated after the latest runtime branding corrections. The final integrated revision has not passed review, CI or native acceptance.

## Implemented source

- Strict ordinary AgentModel create/batch/duplicate admission: explicit registered runtime, saved permitted host, and Prime model/provider binding with owned credential. No host online requirement. Private caller-owned personal hosts remain private; workspace public defaults require a public workspace host.
- Runtime-changing update guards and fixed runtime identity; legacy metadata/graph-only edits retain compatibility. Source runtime inheritance resolves actor preferences and strips environment copying.
- Ordinary/category runtime chooser; shared provider form with first-login setup; template/group member, marketplace and tool callers obtain an explicit runtime before insertion/fork/claim.
- Server/client tool source context and runtime inheritance; runtime query/service; authoritative group visibility before member insertion; group supervisor configuration submitted before group creation.
- Durable marketplace runtimeConfig action/state/contracts and pre-claim/post-claim admission. Actual business-slot executor remains a private deployment override; public stub is unavailable.
- Raw PostgreSQL import admission, legacy import routed through strict Model.batchCreate, legacy SessionModel creation routed through strict AgentModel with agencyConfig preserved; trusted Inbox uses getBuiltinAgent.
- Group/project runtime inheritance and group clone admission. GoalSupervisor private Prime inheritance/model selection correction is saved as WIP; canonical diagnostic capability still blocks actual dispatch.

## Completed checks (not a single final-head acceptance run)

Normal commit hooks passed on the 57-file checkpoint: JSON check, stylelint, ESLint, Prettier, native controls, host/device boundaries. No local tsgo or full suite ran. There was no independent code/TypeScript review of this admission concern before the user froze work.

- Core creation RED: 9 failures/2 passes; intermediate GREEN: 11/11. (local-only log; not committed). Later integration deltas and commit formatting were not rerun against this suite.
- Normal UI maintained tests: 9 pass. Alternate client caller suite: 44 pass; subsequent legacy runtime forwarding suite: 8 pass. Tool source/client suites: 103 pass. These counts overlap; do not add them into one result.
- Group/project source and fixture run: 110 pass, 1 skip. Broader resource history run: 111 pass, 13 fail, 1 skip: (local-only log; not committed).
- Main Agent/device/session/import fixture run: 267 pass, 3 fail, 5 skip: (local-only log; not committed). Two fixture details were corrected before freeze but not rerun; fixed workspace policy duplication assertion remains unchanged and failing.
- Deprecated importer run: 14 pass, 3 fail: (local-only log; not committed). Three remaining incomplete fixtures fail AGENT_RUNTIME_REQUIRED. Deprecated test file was not linted before freeze; final commit hooks linted all staged TS/TSX files.
- Goal focused admission: 2 pass, 26 skip: (local-only log; not committed). Earlier full Goal run: 20 fail, 8 pass because actual Prime cannot mount diagnostic builtin tools.
- Two final group runtime creation regressions (legacy owned member/transfer rollback) were added and linted but not runtime-run before freeze.

Local PGlite tests used reused dependency links plus temporary config aliasing this worktree's @orvilo/types source; no clean dependency install or native product acceptance is established. Configs: (local-only log; not committed), (local-only log; not committed).

## Blocking and incomplete work

1. ~~**HIGH, unresolved upstream provider arming bypass**~~ **RESOLVED:** `providerBinding.ts` create/update now force `enabled:false` on every API save; `checkConnection` remains the only arming path (broker check + text model capabilities). Regression coverage: `apps/server/src/routers/lambda/__tests__/providerBinding.test.ts` (2/2).
2. **Goal capability decision held:** `packages/heterogeneous-agents/src/spawn/builtinToolMount.ts` intentionally reports `canMountBuiltinToolSurface({type:'orvilo'}) === false` / noTools all. GoalSupervisor therefore escalates before execAgent. Do not bypass that gate, flip capabilities, or claim Goal dispatch acceptance. Decide actual supported runtime/capability design; imported mount-capable runtime would differ from the approved Prime-only plan.
3. ~~**Fixed workspace policy duplication**~~ **RESOLVED:** `inheritRuntimeForCreation` now restores the source row's `executionTargetSelectionPolicy` (the owner read view strips it); `agentDeviceBinding.test.ts` passes.
4. ~~**History fixture coverage**~~ **RESOLVED:** every runtime-free fixture now carries a valid saved runtime (host device + typed runtime; orvilo fixtures also get model/provider + enabled binding + owned credential). The full-suite run surfaced 61 `AGENT_RUNTIME_SETUP_REQUIRED` failures (project creation needs a Prime-inheritable orvilo agent); all 10 affected files are green again, shared `seedPrimeRuntime` helper lives at `models/__tests__/_primeRuntime.ts`.
5. **Consumer closures — source done, native acceptance pending:** `buildPlatformAgencyConfig` local targets now carry `executionTarget:'local'` + `boundDeviceId` when the device id is known; ConnectAgent local targets resolve the id through `resolveLocalExecutionIdentity` (the identity owner) when the electron-store snapshot is absent. File-import already runs `assertAgentRuntimeCreation` per imported agent row — legacy archives without a valid runtime are refused (designed closure). Durable marketplace business override forwards `runtimeConfig` — verified (`handleAgentMarketplaceSubmit` → `installMarketplaceAgents`, which hard-fails `AGENT_RUNTIME_REQUIRED` when absent). Native creation/run/restart, scope/offline, cancellation and modal theme/width acceptance still pending.
6. **Remote CI and independent review pending:** new routers/services/merged runtime contracts and late parent integration changes have not had an independent code/TypeScript source pass or remote Typecheck. WIP is not ready for release.

All children were frozen; no live tool/session handles remain. No root services, user DB rows, GUI, branches outside this concern, secrets, or public publications were modified by this worker.
