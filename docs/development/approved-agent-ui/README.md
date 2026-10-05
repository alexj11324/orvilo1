# Approved Agent UI verification

The approved implementation covers login recovery, workspace-first onboarding,
one Agent creation form, searchable model selection, Agent list and settings,
configured-only conversation selection, a unified creation menu, group creation,
and five group settings tabs. English and Simplified Chinese strings ship together.

Product source revision: `15329e274d021949856fa94f4cb474bb25c8263a`.
Implementation commits: `befe5702f`, `8e1ff43a6`; the remaining commit adds the
authorization SPA CI artifact needed by the native verification environment.

The candidate is the real macOS Electron development application running the
isolated worktree. It uses a disposable local PostgreSQL/backend environment.
The original checkout and existing application were preserved. Native OAuth used
a separate fixture account and the normal browser confirmation/callback; this
does not verify production signup. Browser cookies were restored afterwards.

## Final-revision native evidence

These screenshots were captured on the clean product source revision above.

| Evidence                                                    | Observed result                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Workspace first](13-workspace-first.png)                   | Native authorization finishes at step 1: workspace; no survey gates.                              |
| [First Agent](14-first-agent-ready.png)                     | The shared form detects installed OpenCode, selects local execution and the real free MiMo model. |
| [Completed and reloaded](15-onboarding-complete-reload.png) | Creation checks finish; reload enters UI Acceptance Workspace rather than repeating onboarding.   |
| [Group members](12-group-members.png)                       | Saved participant name and the effect of editing a shared Agent are visible.                      |
| [Group opening after reload](11-group-opening-reload.png)   | Opening message and suggested question persist.                                                   |

A read-only database check confirmed the workspace slug `ui-acceptance-first`,
the named private Agent with runtime `opencode` and model
`opencode/mimo-v2.6-flash-free`, and persisted onboarding `finishedAt`.
Group common instructions persisted; Basic, Members, Coordinator, Opening, and
Permissions tabs were exercised through native controls.

## Earlier native path evidence

[Real OpenCode response](07-real-opencode-response.png) was captured with
implementation HEAD `befe5702f` before the later configuration-label/type fixes.
The actual OpenCode CLI returned `ORVILO_UI_OK` using free MiMo. The persisted
response appeared after reload. Live completion feedback remained running until
reload, so live stream completion is **not accepted** by this evidence.

The earlier [list](03-agent-list-final.png), [model search](04-model-search.png),
[creation selection](05-agent-create-selected.png), [login](08-first-login.png),
[authorization waiting](09-login-waiting.png), and
[timeout recovery](10-login-timeout.png) screenshots document development-time
native interactions. They predate the final source freeze and are supplementary
evidence, not proof of every final-revision visual detail. Login cancellation,
browser reopening, timeout retry, Agent renaming, configuration persistence,
configured/disabled conversation choices, and Cmd+K creation entries were exercised.

## Quality gates

- Focused lint, regression tests, and independent source review passed. Checks
  covered creation retry without duplication, capability/model selection,
  configured-only choices, absent configuration data, per-field save recovery,
  and concurrent save ownership. No local `tsgo` was run.
- Final product revision UI alignment run
  [37382231798](https://github.com/alexj11324/orvilo1/actions/runs/37382231798)
  passed. Auth artifact `11374872486` was built on that exact revision and served
  as precompiled test-environment resources for native OAuth.
- Root Typecheck rerun in
  [37382231726](https://github.com/alexj11324/orvilo1/actions/runs/37382231726)
  failed with 42 diagnostics in 20 files unchanged from the inherited PR head
  `3962c9830`. There were zero diagnostics in this implementation's changed
  files. This is a failing repository gate, not a successful typecheck.

## Remaining acceptance gaps

The full frozen size/theme matrix is incomplete. Native controls exercised a
1200 by 800 onboarding window, the existing larger dark settings window, native
window tiling, and zoom. The main application's minimum width prevents the
planned 960-wide and phone-width native windows. Electron DevTools did not expose
the device toolbar; later background-window captures were compositor thumbnails
and were excluded. Portrait/landscape narrow forms and the complete light/dark
matrix therefore remain unverified.

The group coordinator used the local fixture's configured Prime model. Group
creation, configuration, and persistence were verified; a real Prime-provider
group response was not. Full application restart authentication is also not
accepted by the renderer reload evidence. Keep this PR Draft until the remaining
runtime matrix and required repository quality gates are satisfied.
