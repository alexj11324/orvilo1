# Approved Agent UI and Task journey verification

Current verified Group source / documentation candidate: `7c47a19cc059f5617b26652d7faf9706e949f162`.
First automatic Task proof: `904b928d0e49da4338575d25f37b6546a2ab1757`.
Native Task recovery proof: `5e1c2462af7835b77f58dc9669f9900e07d9f08b`.
The actual CLI was rebuilt from `be127a7ad6aac1c4fa5d9fb1b90b12b51823f28f`;
its artifact SHA-256 is `627424d37665f520dc3645d6bb66df5d14a47319eb135d1cd2bed5450f86b285`.
[Build record](evidence/cli-completion-authority-build.json) includes source-file hashes,
staged artifact hashes and successful syntax/version/help checks.

The approved UI covers login recovery, workspace-first onboarding, one Agent creation form,
searchable model selection, Agent list/settings, configured-only conversation selection, a unified
creation menu, group creation and five group settings tabs. English and Simplified Chinese ship together.
Verification uses the real macOS Electron application and installed official OpenCode 1.18.29 with
an isolated local backend/database/device gateway. Original applications and checkout were preserved.

## First automatic Task journey

**Fresh T-7 reached Review in its sole first generation through normal watchdog intake and durable
recovery.** At 08:05:16.960 UTC it was Backlog, domain/requirement revision 2, policy revision 1,
generation 0, with no dispatch or Task topic. The standard watchdog tick started generation 1;
the operation ran 08:05:36.989–08:08:35.263 in the saved personal-device directory. Its admitted
completion receipt requested finalization. The regular next tick at 08:10:40.426 recovered the
terminal operation, and the 08:12:56.805 ledger records Review, an assigned reviewer, succeeded
dispatch, completed topic and cleared lease. Requirement 2 / policy 1 remained unchanged.

No manual Run, second generation, callback replay or observer business status write was used.
No progress comment or persisted brief was produced; neither is claimed. Human review acceptance
was not performed. [Filtered ledger](evidence/t7-first-automatic-native-review-proof.json),
[proof explanation](evidence/t7-first-automatic-native-review-proof.md),
and [native Review](evidence/t7-first-automatic-review-904b.jpg).

The foreground creation operation completed at 08:04:09.221; metadata title work started at
08:04:10.633 and completed at 08:04:50.402. This verifies the title began 1,412 ms after foreground
completion for this run. It does not identify the historical SQLite lock owner or prove every
possible OpenCode concurrency scenario. [Scoped source hashes](evidence/native-runtime-source-hashes.json)
match the frozen title-ordering files.

## Native Task recovery result

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

An earlier T-7 creation attempt on `5e1c2462af7835b77f58dc9669f9900e07d9f08b` failed at startup
with the same SQLite lock,
zero ACP frames, zero tool calls and no Task creation. A title operation overlapped and completed.
The exact SQLite statement and historical lock holder were not observed, so overlap alone does not
establish causation. That failed attempt remains historical evidence; the later accepted first automatic T-7 journey above was captured after the title-ordering repair.
[Filtered T-7 startup facts](evidence/t7-first-startup-negative.json).

The earlier T-4 terminal-callback replay remains qualified recovery evidence on its recorded revision;
it is not a fresh automatic run and is not needed to claim the natural T-5 generation-2 settlement.

## Source preservation and quality checks

A read-only comparison at `074f002a34e54638b214d662375cf0c6e828defe` confirmed that the selected
Orchestrator's `agency_config` and `params` fingerprint matched the pre-T5 baseline, including nested
runtime engine/model. This comparison does not certify unrelated top-level fields or later changes.
[Bounded configuration fingerprint](evidence/source-orchestrator-immutability-074f.json) contains no
raw configuration or account identity list. The later controlled onboarding and final Group proof
repeat this same bounded comparison with the original serialization and matching fingerprint.

[Scoped check excerpts](evidence/quality-check-excerpts.log) record:

- Task detail recovery: 29 tests passed and lint clean; RED cases first reproduced missing scoped Run
  controls for paused/failed recovery. An independent read-only review found no introduced defect.
- CLI completion and operation context: 10 + 64 tests passed and scoped lint clean. RED regressions
  covered operation completion/refusal/incomplete context and operation-ID propagation. Independent
  light review approved the completion-authority change.

Title ordering additionally passed 228 scoped tests and a final 45-test lifecycle selector; Group
navigation passed 7 tests and lint. Their code and TypeScript reviews were approved. These checks,
source reviews and native observations are separate evidence. Group session isolation passed 95
tests and Group association passed 68, each with scoped lint and approved code/TypeScript reviews;
these overlapping suites are per-invocation counts, not a unique combined total. No local `tsgo` was run.
Required repository CI must be checked at the final delivery head; this document does not claim all CI
passed, a merge occurred, or a deployment was accepted.

## Controlled onboarding

The current three-step onboarding was resumed through native controls using an existing fixture:
[workspace](evidence/onboarding-workspace-resume.jpg) →
[existing Agent check](evidence/onboarding-agent-resume.jpg) →
[configured Orchestrator](evidence/onboarding-orchestrator-selection.jpg).
Completion at 08:00:18.643 UTC and [reload into the same workspace](evidence/onboarding-finished-reload-6a37.jpg)
were confirmed on `6a37a149eea1f5e2aa5f032de0d6e1ffd574849e` with metadata-title WIP, which did not
change the onboarding producer. Workspace count stayed 1 and owned nonvirtual Agent count stayed 5,
with unchanged IDs. The selected source's bounded configuration fingerprint also stayed unchanged.
At 08:05:40.296, a read-only check confirmed the exact original `users.onboarding` JSON was restored;
legitimate workspace preferences and business data were retained.
[Sanitized success/restoration record](evidence/onboarding-controlled-resume-restored-6a37.json).
This verifies controlled resume/completion/reload, not fresh signup or an injected finish-error retry.

## Group delegation, isolation and native reload

**The existing private Group completed a fresh real delegation and displayed the coordinator's
result after normal reload on `7c47a19cc059f5617b26652d7faf9706e949f162`.** Creation navigation and
custom coordinator selection had already been exercised on `6bcc5eb154a461c60f2018c8396ef3721402e163`:
[new Group / Local directory](evidence/group-created-active-tab-fixed.jpg),
[configured OpenCode coordinator](evidence/group-coordinator-custom-6bcc.jpg).
The final repetition used a new normal topic in that same Group, without creating a new Task.

The supervisor ran 09:04:36.493–09:06:14.288 UTC and made exactly one actual `executeAgentTask`
request with callback continuation enabled. The isolated member completed 09:05:31.449 and returned
`GROUP_MEMBER_OK`; its child-result delivery was acknowledged. The coordinator's actual assistant
then returned `GROUP_COORDINATOR_OK` followed by `GROUP_MEMBER_OK`, visibly attributed to the
Supervisor rather than the user. All seven topic messages carry the trusted Group ID.
[Filtered complete proof](evidence/group-native-full-acceptance-proof-7c47.json),
[explanation](evidence/group-native-full-acceptance-proof-7c47.md),
[visible result](evidence/group-final-visible-7c47.jpg),
[normal reload](evidence/group-final-reloaded-7c47.jpg).

Parent and child provider session hashes differ, and both final topic-cache hashes match the parent.
An intermediate 09:06:06.795 snapshot records child done and the parent durable row still running;
it does not establish whether finish RPC or binding writes had already begun. Both execution/tool
contexts used `journey-demo`. The bounded source configuration fingerprint stayed unchanged, and no
business Task was created. The file comparison is against the earlier T-7 inventory timestamp and
covers ordinary top-level files only, excluding telemetry.

Historical failures remain explicit. On `6bcc5eb`, parent/child shared a provider session: the member
and callback completed but no coordinator answer followed. A later mis-hit UI delete removed two
fixture supervisor/tool messages; the operator disclosed it, immutable pre-delete evidence was kept,
and no DB restoration was performed. On `3dab813d`, session separation and callback continuation
worked, but the final assistant had a null Group association and was excluded from the Group query.
The fresh current topic proves both corrected boundaries and reload visibility.
[Historical negative facts](evidence/group-historical-negative-facts.json).

The external protocol render-plugin row still reports `in_progress`, while the server runtime
invocation is completed and the child delivery acknowledged. This is a field follow-up; no universal
plugin-state success or unobserved UI failure is claimed. The current source hashes are recorded
[separately from the historical session manifest](evidence/native-runtime-source-hashes.json), since
the persistence handler changed again for Group association.

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

- Fresh-account onboarding and injected finish-error/retry remain unverified; controlled existing-fixture
  resume/completion/reload is accepted above.
- The full light/dark, minimum-width, zoom, hover and responsive matrix remains incomplete. The native
  main window's configured minimum is 1000; its hardware geometry has not been verified here. No
  phone-width or complete narrow-form acceptance is claimed.
- Final personal-device picker/manual opening and remaining ActionPopover keyboard checks need their
  own current native evidence. A renderer reload does not establish full restart authentication.

Only filtered proofs, check excerpts and inspected JPEG screenshots are packaged here. Raw ACP
traces, environment values, credentials and private browser/profile inventories are excluded.

## Review follow-up

Parent source is `efc1ed7b724e059e642123a43392962018c5bd75`; the combined Electron candidate is `233f3cbe04467e6aea252faacec56b93c43f7df9`. Earlier accepted follow-up observations belong to `1dd452becde9cc2dfbdfd24c360db7be80eccce4`. [Source comparison](evidence/review-followup/source-reuse-233f.json) confirms thirteen unchanged parent production files; the two changed readiness/selection files and two host callers require their own fresh checks. Both actual runtime revisions remain ancestors of the delivered child branch.

- Client-first comment edits and deletes carry a validated Agent actor. Human edits still change requirement revisions; foreign claims fail. Client and server Task edits finish the revision-fenced field write before starting dependency mutations.
- Builtin Orvilo readiness verifies Prime's installed execution artifact separately from supported unattended capability. Desktop and CLI reuse the artifact path used for execution. Directory access, tools and broker authorization retain their own gates. Builtin supervisors receive their persona once; OpenCode keeps its explicit context.
- Host inventory refresh retains the selected provider as a disabled option while unavailable, preserving configuration and creation gating. Project creation defaults private, matching the private first Agent; explicit public visibility remains available.
- Group coordinator saves replace the selected runtime snapshot only for a scoped virtual supervisor, with runtime admission revalidated. Omitted protected policy fields remain guarded. Ordinary Agent partial updates retain their merge behavior and fixed identity.

| Verified concern          | Actual evidence and limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private Project default   | [Native default](evidence/review-followup/project-default-private-before-1dd.jpg), [ordinary reload](evidence/review-followup/project-private-coordinator-reloaded-1dd.jpg) and [filtered readback](evidence/review-followup/project-and-group-postsave-1dd.json) show a private Project with its private owned OpenCode coordinator. Auto-dispatch remained off.                                                                                                                             |
| Group runtime replacement | [Seeded stale configuration](evidence/review-followup/group-stale-runtime-before-1dd.jpg), [native save/reload](evidence/review-followup/group-runtime-reloaded-1dd.jpg) and the same readback show old model, args, permission and cwd fields removed. The source Agent fingerprint remained unchanged.                                                                                                                                                                                      |
| Task actor and ordering   | [Actual HTTP calls](evidence/review-followup/api-acceptance-1dd-results.json), [durable readback](evidence/review-followup/task-readback-1dd-results.json) and [explanation](evidence/review-followup/task-api-acceptance-summary-1dd.md) show stale revision 409 with zero dependency mutations, then successful C→B replacement at a fresh revision. Comment create/edit/delete kept Agent attribution and requirement revision. These are maintained client/API checks, not GUI execution. |

The real gateway on `1dd452bec` exposed an installation-path failure: [Prime installed=false](evidence/review-followup/prime-readiness-1dd.json). Native host switching also exposed Base UI fallback: [before](evidence/review-followup/host-before-switch-1dd.jpg), [after](evidence/review-followup/host-unavailable-stable-negative-1dd.jpg), [filtered negative facts](evidence/review-followup/host-retention-negative-proof-1dd.json). These negative records are retained; they are not successful acceptance.

Fresh acceptance on `233f3cbe` passed both checks:

- [Actual gateway callback](evidence/review-followup/prime-readiness-233.json) reports Prime `installed=true`, `unattended=true` and accessible cwd. Broker authentication and required tools remain `unknown`; enabling an automation or executing Prime is not claimed. [Current main/CLI artifact snapshot](evidence/review-followup/runtime-artifact-snapshot-233.json) replaces stale copied metadata with actual files, hashes and collection time. [CLI build record](evidence/review-followup/cli-artifact-manifest-233f.json) records the normal build/staging path and unchanged reused Prime artifact.
- [Before host switch](evidence/review-followup/host-local-before-233.jpg), [unavailable host](evidence/review-followup/host-unavailable-stable-233.jpg) and [return to Local](evidence/review-followup/host-return-local-233.jpg) show OpenCode retained, Create disabled during the fixture's loading failure, and the original MiMo model visible again on Local. [Disabled-state AX](evidence/review-followup/host-unavailable-stable-233.ax.txt) confirms the disabled button. [Return AX](evidence/review-followup/host-return-local-233.ax.txt) has a stale model combobox Value but its child and screenshot show MiMo; configuration retention is established by the return outcome. OpenCode supports default effort only, so no nondefault effort control or run is claimed.

The unavailable host was a clearly labelled local, deny-only UI fixture, not a real remote executor. [Connection ledger](evidence/review-followup/ui-fixture-connection-233.json) records zero handler requests; the loading failure is not attributed to a gateway rejection. The form was canceled without creating an Agent. [Normal fixture removal](evidence/review-followup/ui-unavailable-device-cleanup-233-results.json) and [cleanup readback](evidence/review-followup/host-cleanup-readback-233.json) confirm original device rows and source Agent configuration remain unchanged. These checks performed no ACP/provider execution. Earlier real Task/Group execution above used official OpenCode 1.18.29; no real Codex ACP was launched.

Regressions failed before the fixes. Scoped passing sets overlap and are not added: Task router 88, server Task runtime 70, client executor 15, Task store 47, Agent config 7, UI/form 30 and PGlite Agent model 42 selected tests (146 skipped). The artifact-path checks cover host 28, Desktop 4, CLI 4, existing dispatcher 2 and integrity verifier 4; the real Select set passes 4. Independent code, database and TypeScript reviews approved their bounded changes; normal commit hooks passed. [Check excerpts](evidence/review-followup/check-excerpts.txt) record the invocations. Remote CI remains a separate final-head gate. No local `tsgo` was run.

The isolated Project, Group and three projectless Task records are retained as fixtures. Their Tasks have zero dispatches/topics; successful pause requests did not persist Paused and are not claimed to have done so. The temporary deny-only UI device was removed through the normal API. Original device inventory and source Agent configuration remained unchanged. Raw environment, credentials, connections, profiles and provider payloads are excluded.

### Follow-up at scale

The orchestrator selector still checks runtime eligibility separately for every saved Agent. This can issue roughly one request per Agent in a large collection. A scoped batch readiness query is follow-up work when a large collection shows measured latency; no batch fix or large-scale acceptance is claimed here.
