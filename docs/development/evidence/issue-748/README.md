# Issue 748 verification

Environment: real Electron development app, local Next.js backend, real Go device and Agent gateways, and installed OpenCode 1.18.29 using `opencode/mimo-v2.6-flash-free`. No simulated LLM or device execution. This is local acceptance, not a cloud deployment result.

The dedicated `issue748-qa-20261012` workspace uses disposable QA Agents and a temporary repository. Existing workspace preferences were preserved. `QA_HOST_A` replaces the physical device identifier in the exported data.

## Runtime results

| Check                                                     | Result                                                                                                                | Source revision                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Create private Agent with saved host and discovered model | Passed through Electron UI                                                                                            | `cb72d1326f3b8b93b13232cd20ffea5cb619d83d` |
| Chat through the saved Agent                              | `ISSUE748_CHAT_OK`; operation `done`                                                                                  | `cb72d1326f3b8b93b13232cd20ffea5cb619d83d` |
| Blank `/chat/new`                                         | Configured QA Orchestrator preselected, despite the user's different personal default                                 | `486b0c5c0f68b3646f49dad480500f4778a87b75` |
| Switch to duplicated Agent and send chat                  | `ISSUE748_COPY_OK`; operation `done`, copied Agent ID and saved model recorded                                        | `486b0c5c0f68b3646f49dad480500f4778a87b75` |
| Issue execution                                           | `ISSUE748_ISSUE_OK`; task operation `done`, same saved Agent/model and actual Electron receiver                       | `486b0c5c0f68b3646f49dad480500f4778a87b75` |
| Installation eligibility                                  | Selected runtime probe completed in 4.33 seconds; candidate endpoint reports `verified` and `inventoryComplete: true` | `486b0c5c0f68b3646f49dad480500f4778a87b75` |
| Create/save without host or model                         | All four real API calls rejected with `PRECONDITION_FAILED`, `AGENT_HOST_REQUIRED` or `AGENT_MODEL_REQUIRED`          | `cb72d1326f3b8b93b13232cd20ffea5cb619d83d` |
| Existing duplicate API                                    | Returned a second Agent carrying the saved host/model; its real chat completed                                        | `cb72d1326f3b8b93b13232cd20ffea5cb619d83d` |

[Runtime records](runtime-results.json), [required-config responses](required-config-results.json), and [actual Electron run receipts](desktop-run-receipts.txt) provide the IDs and timestamps. Later commit `fe0a5a33f` only exposes the saved singleton-device binding in Agent settings; it does not change execution routing. Screenshots below cover that delivered UI separately.

The final flat settings and blank-conversation captures use `05f3c65c0c48940f472420449e0c0a4d75aea64c`, rebased onto `a51b741a9` to retain the new settings layout and native CLI catalogs. The copied-Agent chat capture uses `fe0a5a33f3db80bb73ea48dbcbc08b8488765e5b`. The repeated blank conversation selects the QA Orchestrator after the previous conversation used the copied Agent. [Screenshot hashes](screenshot-sha256.json) identify the published files.

## Electron screenshots

- [Saved model, host and execution settings](agent-settings.png)
- [Blank conversation defaults to the Orchestrator](orchestrator-default.png)
- [Chat result and settings popover](chat-result.png)
- [Chat after switching Agent](copy-chat-result.png)
- [Issue result](issue-result.png)

The composer chooses only an Agent. Its settings retain working directory and permission controls, without a model or device selector. Agent settings have no selection-policy controls.

## Automated checks and limits

The server integration test uses real PGlite `workspace_user_settings` rows for two members with conflicting retired overrides and verifies both resolve the shared saved Agent device/model. Focused server, client, database, shared-types, CLI and UI suites passed during implementation; PR checks provide the full remote Typecheck and E2E results for the final head. No local `tsgo` was run.

After rebasing, 119 settings/router tests and 123 shared-types/CLI catalog tests passed. The conflict resolution received an independent narrow review. The final Electron settings capture shows the flat form, saved online host, discovered model and retained working directory/Session Mode; it contains no member selection-policy controls.

Only one physical host was available for this runtime run. Cross-member resolution and device changes are covered by server integration/admission tests; executing on a second physical machine was not verified. The existing duplicate API works, but no duplicate action was found in the current settings menu. This issue adds no new duplication flow.

The local workspace's repository side panel reports that it cannot load repository status, while chat and Issue execution succeed. This is not evidence that repository browsing works on a personal device in a workspace.
