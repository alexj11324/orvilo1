# Issue 769 verification evidence

The final behavioral revision is `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`.
These receipts use the real local Electron application, real OpenCode ACP, and
an isolated seed-user workspace/database. They do not prove cloud deployment.
The evidence commit adds only documentation, receipts and original screenshots.

## Product observations

| Outcome                                                                                                                                                                                                                | Evidence                                                                                                                                                                                                        | Source revision                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Delivery without a reviewer triggers the configured Orchestrator; its `viewTask` / `editTask` calls assign an allowed reviewer, then a fresh reviewer session records `passed` exactly once and the Issue becomes done | [Transcript and persisted state](orchestrator-and-reviewer.json), [Electron result](orchestrator-auto-review-passed-light.jpg)                                                                                  | `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`                                                                             |
| Builder, Orchestrator and reviewer use three distinct native ACP sessions and the saved `opencode/mimo-v2.6-flash-free` model; administrative jobs persist the skip flag and create no verification plans              | [Operation/session records](orchestrator-and-reviewer.json)                                                                                                                                                     | `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`                                                                             |
| Entering canonical `in_review` without a reviewer gives a readable API error; SQL bypassing the service fails PostgreSQL constraint `tasks_in_review_reviewer_required`                                                | [API and raw SQL results](constraint-final.json)                                                                                                                                                                | `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`                                                                             |
| The status menu opens the Agent picker; changing and clearing the reviewer records Agent activity                                                                                                                      | [Entry picker](review-entry-picker-dark.jpg), [changed activity](reviewer-changed-activity-dark.jpg), [cleared activity](reviewer-cleared-activity-light.jpg), [stored activity](unsupported-and-property.json) | Initial picker: `f3412c2a2a5352c2ed6f64ec52425c19fc0ff156`; later controls: `86ef9cf630ef6236212393755338732fd7093b8c` |
| Deleting an Agent referenced by an Issue in review is blocked with the Issue identifier and title, and the Agent remains                                                                                               | [Named Electron error](reviewer-delete-named-error-dark.jpg), [retained Agent](unsupported-and-property.json)                                                                                                   | Deletion UI patch identical to `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`, captured immediately before that commit     |
| A reviewer runtime that cannot mount `submitVerifyResult` launches no reviewer operation and explains the waiting state                                                                                                | [State and zero reviewer operations](unsupported-and-property.json), [Electron explanation](unsupported-reviewer-waiting-light.jpg)                                                                             | Action: `134edda87cf0c9f3047d8c0ab8abfa28f5e40da6`; final renderer: `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`         |
| An offline check waits; reconnect automatically runs the same operation and topic, then records a passing verdict                                                                                                      | [Before/after receipt](offline-reconnect.json), [waiting](offline-reconnect-waiting-dark.jpg), [passed](reconnected-passed-dark.jpg)                                                                            | `86ef9cf630ef6236212393755338732fd7093b8c`                                                                             |
| A device remaining offline expires the check only after both queue age and confirmed absence exceed five minutes; no verdict is fabricated                                                                             | [Both clocks and terminal state](offline-grace.json), [readable Electron reason](offline-grace-final-error-light.jpg)                                                                                           | `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`                                                                             |
| A person can accept while queued, while running, and after an offline error; queued acceptance prevents later launch after reconnect                                                                                   | [Three decisions](manual-decisions.json), [acceptance after timeout](offline-grace-final-accepted-light.jpg)                                                                                                    | Queued: `86ef9cf630ef6236212393755338732fd7093b8c`; running/errored: `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`        |
| Editable reviewer starter instructions save in the Agent's own external-runtime context                                                                                                                                | [Editable starter text](reviewer-instructions-example-dark.jpg), [saved instructions](creation-instructions-db.json)                                                                                            | `86ef9cf630ef6236212393755338732fd7093b8c`                                                                             |
| The task conversation panel creates T-6 and updates its title through the configured Orchestrator                                                                                                                      | [Real tool transcript](task-panel-transcript.json)                                                                                                                                                              | `134edda87cf0c9f3047d8c0ab8abfa28f5e40da6`                                                                             |

The offline grace receipt records queue and confirmed-absence timestamps of
`2026-10-13T15:09:44.317Z`, with failure at `15:15:09.187Z`: 324,870 ms for
each clock. Manual acceptance followed through Electron, and the device was
reconnected through its public gateway IPC.

Earlier receipts are reused because their affected production paths did not
change in the later fixture, administrative-skip and deletion-message commits.
The earlier reconnect run also exposed administrative verification recursion.
Commit `ed490845c` repaired it; the final Orchestrator receipt separately proves
the repaired jobs have `skipTaskVerification=true` and no `verify_runs`.
The T-17 transcript and screenshot precede a later QA interaction that marked
its already-passing check ignored; they capture the automatic outcome before
that manual action.

[Environment and original screenshot dimensions](environment.json) records the
actual desktop setup. Screenshots cover light and dark controls at native
window sizes. Receipts omit credentials, device queue launch payloads, private
profiles and raw ACP traces.

## Quality checks

- [Executed Test CI](https://github.com/alexj11324/orvilo1/actions/runs/38415651029): all 17 jobs passed on `d32cb6b4b5a7679c56c7880c6a111658f6f622b1`, including remote Typecheck, both server/app shards, database, packages, desktop, Windows shell and Required Quality Gate.
- [Executed E2E job](https://github.com/alexj11324/orvilo1/actions/runs/38415650902/job/115365753166): 36 scenarios and 221 steps passed on that same revision, including auto-scroll. [GitHub Actions artifact](https://github.com/alexj11324/orvilo1/actions/runs/38415650902/artifacts/11826070366). The first attempt failed before tests on Public ECR HTTP 429; one targeted retry passed.
- Scoped local lint and regressions passed. Independent light reviews covered the DB/API/UI/runtime changes and the subsequent repairs. No local `tsgo` was run.
- Source grep over `apps`, `src` and `packages`, excluding tests, test fixtures and historical migrations, has no `verifyAgent`, `taskAgent`, `verify-agent` or `task-agent` hits.

The reviewer invariant covers common TaskModel create/update/CAS/bulk writers,
dispatch settlement, API/task tools, board/status-menu/My Work/create moves,
inbound Linear status sync, and copy/transfer/delete/member lifecycle paths.
Criteria generation, check-plan generation, reporting and review prediction
use ACP on the Issue reviewer. Pre-Issue goal generation uses the explicitly
selected normal Agent because the Issue does not exist yet. No verification
path resolves a server model or provider.

No production migration or existing-row compatibility path was added, as
requested by #769. The fresh QA/test schema is initialized explicitly.
