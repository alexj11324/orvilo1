# Real OpenCode / Electron component acceptance

Date: 2026-10-09. This supplements the earlier explicitly synthetic component gallery.

## Revision and transport

- Feature source: `58581f7a0b039cf51ed4df6b3b6e88a8f5e1e5e4`.
- Electron runtime: `29159db1581ba1f67549a9dd4d7250b5a02c0ff3` in the retained real-model worktree. Component changes match the feature source. The runtime retains the existing development gateway/auth configuration and is not a byte-identical checkout of the entire feature branch.
- Real Electron at 1440 × 1000, registered/authenticated local execution device, OpenCode 1.18.35 and `opencode/step-5-preview-free` (the user's selected model).
- Messages were sent using the Electron composer. Neither assistant replies nor tool results were injected. Topic setup used the application's topic API and working-directory metadata action before sending.
- The old runtime lacked current-canary native permission bridge, intervention transport and persistence changes. Those existing mainline changes were synchronized into the acceptance worktree before the successful native approval run; they are not new product fixes in this component PR.

## Real result run

Topic: `tpc_M2kS8mn7ELef`; completed before the later approval probe.

The model was asked to execute separate `cat .vitest/json/output.json`, `git log -1`, and `node error.cjs` commands in `/tmp/orvilo-elements-live`, then glob `src/*`, read `src/example.js`, and return a complete HTML summary using the observed counts.

The workspace is an isolated acceptance repository, not the application repository. Its actual Vitest run contains one passing case, one deliberately failing assertion (`expected 5 to be 6`), and one skipped case. Its Node program deliberately throws `TypeError: Real execution acceptance error`. These failures test rendering and are not failures of the application checks.

| Surface           | Observed outcome                                                                                                                                                 | Evidence                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Test Results      | Complete report shows 1 passed / 1 failed / 1 skipped; suite collapse/expand works                                                                               | [Results](test-results.png), [interactions](interactions.json)                   |
| Commit            | Actual `git log -1` becomes the Commit card; copied full hash equals `8b4fe3d4010cec63f4ceb4d8a231eeb08c6d22e1`                                                  | [Commit](commit.png), interactions.json                                          |
| Stack Trace       | Actual Node stderr excerpt/footer is normalized into the official frame renderer; copy matches the error and frames                                              | [Dark stack](stack-dark.png), interactions.json                                  |
| Stack file action | Clicking the application frame opens actual `error.cjs`; `node:internal` pseudo-files are disabled                                                               | [Source preview](stack-file-preview.png), [observations](file-verification.json) |
| File Tree / Read  | Real OpenCode glob/read results display filenames; file-name click opens the existing source portal and folder action selects the file in the workspace explorer | [File preview](file-preview.png), [reveal](file-reveal.png)                      |
| Web Preview       | Step5's actual HTML reply renders in the existing isolated iframe; code/preview switch and refresh work; iframe text matches report counts                       | [Preview](web-preview-live.png), interactions.json                               |

Results persisted across Electron reload. Light and dark screenshots use the application theme setting. File actions open the in-app source portal / workspace explorer, not the operating-system file manager. Stack links currently open the file; they do not move the editor caret to the displayed line and column.

## Native permission round trip

Successful new topic: `tpc_Q6rFzyRt8QgR`.

The model was asked to read the owned acceptance file `/tmp/orvilo-elements-approval/note.txt`, outside the selected workspace, using the read tool without a shell or permission bypass. Electron displayed OpenCode's permission choices. Selecting **Allow once** and submitting resumed the read; Step5 returned the exact content `Real approval bridge acceptance: read-only file.` Both send and execution operations reached `completed`.

[Completed approval](approval-complete-dark.png) · [operation states](approval-verification.json).

An earlier probe using the stale runtime did not resume correctly and was cancelled through the application's cancellation action. Its old pending UI/notification is not evidence of a successful round trip. The new-topic result above is the successful current-code run.

## Checks and limits

- The connection/parser/file-capability delta passed 35 related tests and scoped lint.
- The subsequent stack file-link delta passed 10 related parser tests and scoped lint, including two new path-target regressions. Test Results layout remains unchanged.
- Native-control and host-device boundary pre-commit checks passed.
- One independent review and its bounded follow-up resolved both adapter/envelope findings. That review preceded the small stack-link follow-up; no second independent pass is claimed for that follow-up.
- Audio playback/seek and Agent metadata evidence remain in the earlier component acceptance. This real model run does not claim generated audio, object-storage upload, HTML download, Windows/macOS file actions, or full repository CI success.
- Truncated OpenCode file reads and unsupported result formats retain raw output. The first report read was truncated by the provider's long-line limit; a real `cat` tool call supplied the complete report. No counters were invented from incomplete data.
