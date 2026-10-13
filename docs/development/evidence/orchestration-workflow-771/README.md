# #771 Electron verification

Planning, conversation reply, real board Issues and file delivery were exercised on backend revision `b31e830e2b39766c3830c9ec43a068e8fcd5b30d`. The later canonical reviewer-policy correction has a regression that failed before the fix and passed afterward; its live API check is recorded in PR #779 at that correction's commit SHA.

The dedicated local environment uses Electron 43.2.0 under Xvfb, PostgreSQL, Redis, both pinned local gateways (`81f26f8af942484da644921eae08371f834bfd72`), and OpenCode 1.19.0 with `opencode/mimo-v2.6-flash-free`. No server model/provider binding is configured (`provider_bindings`: 0). The public coordinator and ordinary Agents bind to the enrolled workspace device. The coordinator is the workspace's configured Orchestrator. The approved working directory is `/home/agent/Desktop`.

Sign-in uses the existing seed-login helper. Device enrollment and Agent configuration use public product APIs. Requests, confirmation, reload and screenshots use the actual Electron renderer through CDP. No orchestration rows, dispatch receipts or deliverables were manually inserted.

| Scenario                                                       | Observed result                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plain request for two independent files, plan before execution | Real parent T-10 and distinct children T-11/T-12 created on the board. Both children are Backlog; no confirmation stamp; 0 child dispatches; `getStatus.waitingReason` is `plan_not_confirmed`.                                                                                                        |
| Reload before replying                                         | Complete persisted split remains in the conversation: descriptions, checkable byte criteria, effective assignee, verification policy, dependencies and budgets.                                                                                                                                        |
| Normal conversation reply confirming the split                 | Confirmation stamped at `2026-10-13T17:49:08.392Z`; orchestration workflow becomes running. Both independent child Issues actually dispatch, using the coordinator Agent, the real user as initiator, and CAID origin. Parent has 0 dispatches. No Start or confirmation dialog is used for this step. |
| Delivery by the two child Issues                               | `proof-alpha.txt` is exactly `b'Alpha'` (5 bytes); `proof-beta.txt` is exactly `b'Beta'` (4 bytes). Both have no newline. Worker operations reach `done`; downstream verification is a separate result.                                                                                                |
| Equivalent plan-first request to ordinary Agent                | Ordinary Agent provides a conversation plan and waits. Its operation finishes; it creates no orchestration workflow, and neither `ordinary-*.txt` file exists.                                                                                                                                         |
| Orchestrator Q\&A, 13 + 17                                     | Replies `30` in the conversation; operation finishes; no new orchestration workflow.                                                                                                                                                                                                                   |
| Pause through conversation API                                 | State becomes paused and `getStatus.waitingReason` becomes `paused`; the test attempt is paused after collecting delivery evidence.                                                                                                                                                                    |

![Persisted split before confirmation](./reply-plan-pending.png)

![Real parent and child Issues with execution history](./parent-and-dispatched-issues.png)

![Ordinary Agent keeps the delivery plan in conversation](./ordinary-delivery-plan.png)

![Orchestrator answers a question directly](./coordinator-qa-latest.png)

See [runtime-checks.txt](./runtime-checks.txt) for fixture ids and compact observations. Screenshots preserve the frontend owner's existing copy, including old labels in execution history; this backend PR does not change those labels.

## Limits and failures observed

The independent verification engine did not complete in the original test setup: the default builtin reviewer had no bound device, and an ACP task-handoff judgment also returned no parseable JSON. File delivery and actual dispatch are proven; a final verified/achieved result is not claimed. The existing verification engine is retained, with independent reviewer work separately tracked in #769. An available device-bound reviewer can be selected through the ordinary Issue verification settings; that selection must be reflected by the card API and posted plan.

The first request encountered an unrelated OpenCode request to read its configuration directory; it was rejected. A normal follow-up asked the Orchestrator to continue without that read. It first guessed an invalid Agent id; the server rejected it without creating partial Issues. It then prepared the split using effective defaults. The tool descriptions and Orchestrator instructions now explicitly say to use real accessible ids and explain omitted assignee/reviewer defaults accurately.

Earlier revision `76d56bf9f69e0ccf6167a563885abc087538f657` supplied the archived `ordinary-qa.png`, `coordinator-qa.png` and `plan-before-confirmation.png`. Those images predate the owner's final conversation-reply requirement and do not prove the current start protocol. No old permission-dialog approval is claimed as current acceptance.
