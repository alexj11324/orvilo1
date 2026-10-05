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

1. **HIGH, unresolved upstream provider arming bypass:** `apps/server/src/routers/lambda/providerBinding.ts` create and update forward client config.enabled unchanged. `apps/server/src/services/providerBinding/configuration.ts` documents/implements broker check + text model capabilities before setEnabled(true). A crafted save with enabled:true can therefore arm a saved row without that broker check. This is source-inspection evidence; no new API reproduction was run before freeze. Repro recipe: save a caller-owned credential reference and enabled:true binding for an unverified model, then observe router persists enabled:true without checkConnection. Proposed force-enabled-false API save fix was NOT started, per explicit user freeze.
2. **Goal capability decision held:** `packages/heterogeneous-agents/src/spawn/builtinToolMount.ts` intentionally reports `canMountBuiltinToolSurface({type:'orvilo'}) === false` / noTools all. GoalSupervisor therefore escalates before execAgent. Do not bypass that gate, flip capabilities, or claim Goal dispatch acceptance. Decide actual supported runtime/capability design; imported mount-capable runtime would differ from the approved Prime-only plan.
3. **Fixed workspace policy duplication:** failing `agentDeviceBinding.test.ts` case `preserves a valid fixed workspace-device contract when duplicating` shows runtime inheritance strips executionTargetSelectionPolicy fixed. Keep the assertion; source fix remains unimplemented.
4. **History fixture coverage:** 13 groupHistoryJob cases still construct runtime-free cloning sources/targets and fail AGENT_RUNTIME_REQUIRED. Three deprecated import fixtures remain incomplete. Main suite last 3 failures include 2 corrected-but-unverified fixture details and the policy defect above.
5. **Remaining integration and runtime acceptance:** imported ConnectAgent platform-local builder still omits saved host/target; CLI-local permits an absent currentDeviceId until core identity owner supplies it. Strict admission now rejects those incomplete paths. File-import UI has no new runtime chooser wiring; legacy archives need valid selected runtime input or are refused rather than creating a selectable fake Agent. Devin must finish these consumer closures, verify durable business override forwards runtimeConfig, and run native creation/run/restart, scope/offline, cancellation and modal theme/width acceptance.
6. **Remote CI and independent review pending:** new routers/services/merged runtime contracts and late parent integration changes have not had an independent code/TypeScript source pass or remote Typecheck. WIP is not ready for release.

All children were frozen; no live tool/session handles remain. No root services, user DB rows, GUI, branches outside this concern, secrets, or public publications were modified by this worker.
