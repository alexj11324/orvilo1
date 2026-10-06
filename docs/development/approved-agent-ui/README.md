# Approved Agent UI and Task recovery verification

Native Task recovery source: `5e1c2462af7835b77f58dc9669f9900e07d9f08b`.
The actual CLI was rebuilt from `be127a7ad6aac1c4fa5d9fb1b90b12b51823f28f`;
its artifact SHA-256 is `627424d37665f520dc3645d6bb66df5d14a47319eb135d1cd2bed5450f86b285`.
[Build record](evidence/cli-completion-authority-build.json) includes source-file hashes,
staged artifact hashes and successful syntax/version/help checks.

The approved UI covers login recovery, workspace-first onboarding, one Agent creation form,
searchable model selection, Agent list/settings, configured-only conversation selection, a unified
creation menu, group creation and five group settings tabs. English and Simplified Chinese ship together.
Verification uses the real macOS Electron application and installed official OpenCode 1.18.29 with
an isolated local backend/database/device gateway. Original applications and checkout were preserved.

## Current Task recovery result

**T-5 reached Review after a human clicked the native scoped Run action to recover a failed run.**
Generation 2 then executed and settled through normal callbacks and asynchronous brief judgments.
This proves native recovery followed by natural settlement; it is not first-attempt automatic success.
No manual callback replay or diagnostic Task status mutation was used for this generation.
Human review acceptance was not performed.

| Stage                  | Observed result                                                                                                                                                                                                                                                               | Evidence                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Original creation      | On `26e4b193f`, four fresh Task MCP calls created T-5, viewed it, edited with `expectedDomainRevision: 1`, then viewed Backlog/domain revision 2. Correct Agent/private Project persisted; historical calls were excluded.                                                    | Original filtered creation evidence remains separate from the current generation-2 proof.                                         |
| First automatic intake | The normal watchdog minted generation 1. Official OpenCode exited with `database is locked` before ACP output; normal recovery marked dispatch/topic failed. This failed attempt remains in history.                                                                          | [Generation-1 and generation-2 ledger](evidence/t5-generation2-native-review-proof.json)                                          |
| Native recovery entry  | Task detail exposes the existing Run action inside its own Task scope. The native screen shows T-5's failed execution and the Run entry.                                                                                                                                      | [Scoped Run entry](evidence/task-t5-scoped-run-entry-5e1c.jpg)                                                                    |
| Recovered execution    | Run minted generation 2; the operation completed at 07:20:59.410 UTC, dispatch succeeded and topic completed/succeeded. CLI completion requested finalization through its admitted operation. Requirement revision 2 / policy revision 1 stayed unchanged.                    | [Filtered proof](evidence/t5-generation2-native-review-proof.json), [explanation](evidence/t5-generation2-native-review-proof.md) |
| Review settlement      | Brief decision and synthesis completed at 07:21:30.522 and 07:22:35.133 UTC. The 07:24:51.235 read-only ledger records `in_review`, an assigned reviewer, domain revision 5 and generation 2. The native screen shows Review, execution success and both run-history entries. | [Native Review](evidence/t5-natural-review-gen2-5e1c.jpg)                                                                         |
| Output and attribution | `NATIVE_JOURNEY_T5.md` contains exactly the requested 20-byte marker. A real progress comment is attributed to the Agent with no human author and no requirement revision increment.                                                                                          | [Artifact, comment and cwd facts](evidence/t5-generation2-native-review-proof.json)                                               |

The business-file comparison covers ordinary top-level files only, excluding runtime telemetry.
Its prior hashes were transcribed from an earlier observer output, rather than a persisted pre-run
snapshot; it does not prove the entire directory was unchanged. Completion receipt frames have no
individual timestamp, so the proof uses their operation interval and persisted completion pointer.

## Negative cases retained

T-6 produced its output file but called bare CLI Task completion through the human terminal-mutation
path. The Task became Done while its dispatch/topic were canceled and operation interrupted, with no
reviewer. This is a genuine completion-authority failure, not successful Review. The CLI repair now
propagates operation context and requests completion through the operation; it refuses an incomplete
or rejected operation capability. The fresh T-5 generation-2 result above supplies the positive runtime
proof. [Filtered T-6 facts](evidence/t6-cli-self-completion-negative.json) preserve the original failure;
T-6's state was not rewritten.

A fresh T-7 creation attempt on the current source failed at startup with the same SQLite lock,
zero ACP frames, zero tool calls and no Task creation. A title operation overlapped and completed.
The exact SQLite statement and historical lock holder were not observed, so overlap alone does not
establish causation. **The fresh first-run automatic journey remains pending.**
[Filtered T-7 startup facts](evidence/t7-first-startup-negative.json).

The earlier T-4 terminal-callback replay remains qualified recovery evidence on its recorded revision;
it is not a fresh automatic run and is not needed to claim the natural T-5 generation-2 settlement.

## Source preservation and quality checks

A read-only comparison at `074f002a34e54638b214d662375cf0c6e828defe` confirmed that the selected
Orchestrator's `agency_config` and `params` fingerprint matched the pre-T5 baseline, including nested
runtime engine/model. This comparison does not certify unrelated top-level fields or later changes.
[Bounded configuration fingerprint](evidence/source-orchestrator-immutability-074f.json) contains no
raw configuration or account identity list.

[Scoped check excerpts](evidence/quality-check-excerpts.log) record:

- Task detail recovery: 29 tests passed and lint clean; RED cases first reproduced missing scoped Run
  controls for paused/failed recovery. An independent read-only review found no introduced defect.
- CLI completion and operation context: 10 + 64 tests passed and scoped lint clean. RED regressions
  covered operation completion/refusal/incomplete context and operation-ID propagation. Independent
  light review approved the completion-authority change.

These checks, source reviews and native observations are separate evidence. No local `tsgo` was run.
Required repository CI must be checked at the final delivery head; this document does not claim all CI
passed, a merge occurred, or a deployment was accepted.

## Retained earlier approved UI evidence

The following evidence belongs to `15329e274d021949856fa94f4cb474bb25c8263a`, with implementation
commits `befe5702f` and `8e1ff43a6`. It remains useful historical coverage rather than proof of every
current-revision visual detail.

| Evidence                                                    | Observed result                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Workspace first](13-workspace-first.png)                   | Native authorization enters workspace setup without survey gates.                   |
| [First Agent](14-first-agent-ready.png)                     | Shared form detects OpenCode, selects local execution and the real free MiMo model. |
| [Completed and reloaded](15-onboarding-complete-reload.png) | Reload enters the created workspace rather than repeating onboarding.               |
| [Group members](12-group-members.png)                       | Saved participant name and shared Agent editing effect are visible.                 |
| [Group opening after reload](11-group-opening-reload.png)   | Opening message and suggested question persist.                                     |

Native OAuth used a separate fixture account and normal browser confirmation/callback, not production
signup. Earlier [list](03-agent-list-final.png), [model search](04-model-search.png),
[creation selection](05-agent-create-selected.png), [login](08-first-login.png),
[authorization waiting](09-login-waiting.png) and [timeout recovery](10-login-timeout.png) cover the
recorded interactions. [Real OpenCode response](07-real-opencode-response.png), captured on `befe5702f`,
returned `ORVILO_UI_OK` and persisted after reload; live completion feedback remained running until
reload, so that older screenshot does not accept live stream completion.

Historical UI alignment [37382231798](https://github.com/alexj11324/orvilo1/actions/runs/37382231798)
passed on `15329e274d`. Its Auth artifact supplied native OAuth resources. Historical Typecheck
[37382231726](https://github.com/alexj11324/orvilo1/actions/runs/37382231726) failed; that result describes
the older revision and is not an exception to current required gates.

## Remaining acceptance

- Fresh first-run creation → automatic intake → execution → Review without recovery remains pending.
- New/existing Group directory binding, real member delegation and callback completion remain pending.
- Current three-step onboarding resume/completion/retry remains pending; earlier onboarding evidence
  above covers an older source and does not verify the current controlled-resume fixture.
- The full light/dark, minimum-width, zoom, hover and responsive matrix remains incomplete. The native
  main window's minimum width is 1000; no phone-width or complete narrow-form acceptance is claimed.
- Final personal-device picker/manual opening and remaining ActionPopover keyboard checks need their
  own current native evidence. A renderer reload does not establish full restart authentication.

Only filtered proofs, check excerpts and inspected JPEG screenshots are packaged here. Raw ACP
traces, environment values, credentials and private browser/profile inventories are excluded.
