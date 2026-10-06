# Issue UI correction verification

The nine approved product criteria passed in the isolated Electron candidate on
2026-10-06. The delivered product source is commit
`21a46d9c4c0bdfa14c352e6272d5bf8b468676a7`, on `codex/issue-ui-corrections`.
A subsequent scoped repair is commit `fec33c076b685730f1bdc46d371f5eac69ace4ad`. Its affected native priority and Agent navigation paths were rechecked; the original-session source and CLI artifact hashes remain unchanged.

## Product acceptance

| Criterion            | Observed result                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation           | Root opens Issues; one Issues destination; sidebar creation actions removed; Agent creation stays on Agents. Reload removes a saved Reviews tab (8 restored tabs became 7).                                                                                                                                                                                     |
| Retired entry points | Reviews is absent from navigation/customization/commands/hotkeys/native menus. Application goal creation is absent; native ACP capabilities and persisted records are retained. Regression coverage includes old stored preferences and menus.                                                                                                                  |
| Workflow identity    | Issue menus use circular workflow glyphs; Project menus use their hexagonal lifecycle glyphs. Native Issue Todo selection and Run transition to In Progress were exercised.                                                                                                                                                                                     |
| Project properties   | Status changed to Planned, priority to Low, and members were removed through actual controls; reload and database readback preserved the changes. Compact property pills and menus were inspected in light/dark and normal/narrow windows.                                                                                                                      |
| Project policy       | Overview no longer exposes orchestration policy controls. Existing cross-project execution settlement continues to own run-start and completion workflow transitions. No new automatic board planner is claimed.                                                                                                                                                |
| Project activity     | Dedicated comment/update editor and activity rows. Forced backend failure displayed a publish error and preserved the draft across reload. Retry posted once; the final successful comment left an empty draft after reload.                                                                                                                                    |
| Agent identity       | Agent rows, actors and Inbox questions use runtime brands. The native completion showed the Claude brand; the comment/mention actor retained the human avatar and name.                                                                                                                                                                                         |
| Group lifecycle      | Created a Group with existing Agents, selected and changed its coordinator, and saved Description. Creation kept the same 13 Agent IDs. Deleting that Group returned no virtual Agent deletions and preserved all 14 current Agent IDs, content and ACL hashes. Description/member-only UI was inspected in dark/normal, light/normal and light/narrow windows. |
| Inbox                | A real Claude native question became a durable Inbox item with its original question/options. Reply returned to the original operation; its producer acknowledged the same request and the same session continued. Completion/comment/mention notification read, unread, snooze and dismissal persisted.                                                        |

The native window measured 1291 × 886 CSS pixels normally and 1001 × 965 when
tiled narrow. Final profile theme was restored to Dark. Screenshots were inspected
inline during native computer use; this directory contains no exported screenshots
and does not certify whole-product Linear parity.

## Original-session continuation

INQ-4 used one original TaskTopic, operation and native session. Inbox submitted
`Narrow` at 15:51:28.542 UTC; the CLI producer acknowledged it at 15:51:28.829 UTC.
Both responses carried resolution request
`4235f3ea-5602-4129-a5e2-486c81140467`. The original session then emitted
`INBOX_NATIVE_CONTINUED:Narrow` and its original prompt ended with `end_turn`.
The original operation ended `done`; the TaskTopic ended `completed/succeeded`.

[Database and stream evidence](./evidence/native-final4-evidence-db.json) and
[filtered native trace evidence](./evidence/native-final4-evidence-trace.json)
preserve the original IDs, timestamps and result. The trace occurred before final
commits, so it records the then-current HEAD and dirty flag. Its exact owning source
hashes match the committed files at `21a46d9c4`:

| File/artifact                                                                    | SHA256                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/store/chat/slices/agentRun/actions/entries/conversationControl.ts`          | `8fbfb946011866e9c3482c69a84b581f71ec5ed1d2cc1c9ce72b8bbb27fefacb` |
| `apps/server/src/services/heterogeneousAgent/HeterogeneousPersistenceHandler.ts` | `da2b3c508b4a30cb59c1658ffa09d738cdcd07251a4132a5caf2a8efe612ea32` |
| `apps/cli/dist/index.js`                                                         | `eaaace8249510b96a32e6bc588d40e1f988e4916d887639bb803f7a64889afdb` |

The CLI artifact was built from the candidate, rather than copied from another
checkout. The actual accepted native provider was Claude, using its default Opus
model. This does not establish Codex native questions or model-selection parity.

## Persistence and recipients

[Fixture persistence evidence](./evidence/fixture-persistence.json) records Group
Agent/ACL equality, completion read/unread/snooze/dismiss readback, Project outcomes
and actual comment/mention recipients. The temporary member used the real comment
API and a Lexical member-mention node. Only the authorized owner received the
notifications; the actor was excluded. A write to the private native Issue was denied
with `NOT_FOUND`. Temporary fixture membership and auth sessions were removed.

The local acceptance runtime deliberately disabled recurring jobs. Completion and
comment outbox entries were projected by invoking the existing
`CollaborationOutboxProjector.projectPending()` worker, which is also used by the
scheduled job. This was an actual worker invocation, with no notification inserts
or mocked projection. After UI dismissal, replay projected zero entries and the
notification count remained zero.

## Checks and limits

Focused behavioral regressions failed before the fixes and passed afterward.
Retained check output covers 93 native-question persistence tests, 72 conversation
control tests, 109 Inbox app/server tests and 133 notification/TaskTopic database
tests. These runs overlap; they are not an aggregate test count. Scoped lint passed
for the delivered concerns. Independent code and TypeScript reviews covered the
final source and the concrete failures found during native acceptance.

The acceptance runtime used Electron 43.2.0, a cloned local database and local
gateways. Next development compilation stalled, so an isolated HTTP adapter loaded
the actual production Next route handlers, auth, routers and mutations from this
checkout. No production credentials, provider configuration, raw traces or browser
profiles are published here. OS notification delivery and a full Group conversation
execution were outside this acceptance run.

The branch starts at `57d1293aa`, containing earlier navigation/task-sharing work
also represented by separate draft PRs. These five delivery commits have not been
merged to `canary`; this report does not certify an independently rebased merge
candidate. Primary-checkout unrelated work was preserved.

Remote Typecheck at `21a46d9c4` reported type/import/test-fixture errors. Desktop
typecheck/tests and Host Device, Native Controls, Slimming Boundary and Windows Shell
jobs passed at that revision. The concrete repair at `fec33c076` passed 177 web tests, 3 targeted PGlite database cases, scoped lint and independent code/TypeScript reviews. A real category-menu hook render failed on the previous source with `FolderPenIcon is not defined` and passed after the import fix. Native Project priority changed Medium → Low and survived renderer reload; Agent sidebar displayed the translated Issues link and navigated to the board.

The previous [Test CI run](https://github.com/alexj11324/orvilo1/actions/runs/37496302362) failed Typecheck and cancelled its remaining shards. Remote results for the final pushed revision are available in [branch Actions](https://github.com/alexj11324/orvilo1/actions?query=branch%3Acodex%2Fissue-ui-corrections); they remain a separate gate and are not implied by product acceptance. No local `tsgo` was run.

### Follow-up regression alignment

At `72cccd5d5`, remote Typecheck, Desktop, Packages, UI alignment and the boundary checks passed. The database job then reported 4 failures (5489 passing cases): a legacy owned-Agent fixture did not mark its Agent virtual, and three global Outbox sweep tests inherited personal-scope events from earlier suites. Fail-fast cancelled the remaining test shards. Their available logs also identified four obsolete App assertions. E2E completed 32 of 36 scenarios; its four failures all looked for the retired sidebar new-conversation button.

The follow-up changes test files only. Owned-Agent rejection now uses an actual virtual Agent and additionally checks independent handover of a shared non-virtual coordinator. The Outbox suite clears its global event fixture before/after each test. App fixtures/assertions reflect Issues navigation, retired Reviews shortcuts, explicit runtime brands and the durable native operation ID. E2E opens the retained command palette action and asserts an empty conversation with the same Agent. The fixture uses the unique name `Orvilo AI (E2E Prime)`, so the default Inbox cannot satisfy this assertion.

All four database failures were reproduced before repair; six selected database cases passed afterward. All four App failures were reproduced before repair; the four owning suites passed 145 cases afterward. E2E lint and Cucumber dry-run passed (20 Agent scenarios, 130 bindings); dry-run is not runtime acceptance. Remote CI must validate the repaired journeys and finish the cancelled shards. Product source and the accepted native-session hashes are unchanged by this follow-up.

### Dependency resolution drift

The `d07cfc643` remote Typecheck and Desktop checks passed, but global lint installed `@lobehub/ui 5.57.0` and reported 29 new Form import restrictions in untouched modules. The preceding `72cccd5d5` job installed `5.56.0` and passed that same lint command. The local Electron acceptance also used `5.56.0`. This is dependency resolution drift through the existing `^5.47.0` range, not a new defect in the changed Issue surfaces. The dependency is now pinned to the already accepted `5.56.0`; no legacy Form migration or new dependency was introduced. Local full-repository `lint:ts` then completed with 0 errors (119 existing warnings). E2E at `d07cfc643` passed all 36 scenarios and 221 steps, including the unique Agent assertion. Remote Test CI still needs to finish on the pinned revision.
