# AI Elements / ReUI — independent Electron acceptance

Date: 2026-10-09. Implementation baseline: `14c4fc51e596db7e696604c7edcb1fcf2c4c8070`.
Final source/screenshots: `d5ddda5fc9eff2c89fa96da3011862c003bc02f3`
(confirmation width correction).
Actual Electron 43.2.0 on Xvfb, app\://renderer, local Next/PostgreSQL backend.
These are disclosed synthetic persisted messages and synthetic operation states.
No successful Step 5 gateway inference is claimed. Device gateway authentication
remains unavailable; earlier direct CLI success is not desktop E2E evidence.

## Verified through actual UI and state

- ReUI ordinary Markdown code: 30-line JS, unknown language, empty fence and
  unfinished Python fence all render. Copy reads exactly 30 lines into the real
  clipboard; actual download `code.js` matches clipboard content byte-for-byte.
  Wrap changes to No wrap; Show more expands (`aria-expanded=true`). Horizontal
  viewport scroll reaches 80 px with width 733 / scrollWidth 1083.
- Acceptance discovered inherited pre overflow:auto made the sticky number
  gutter cover first characters. Root scoped the adapter pre overflow/margin;
  visual recheck shows complete `hello`, `second`, `print` prefixes and horizontal
  scroll still works. No shared ReUI source workaround was introduced.
- Actual Reasoning expands persisted text and displays duration 2.3 seconds.
  Synthetic reasoning auto-opens; manual collapse stays closed through an active
  operation update. Reasoning state observations: true → false → false.
- Actual Tool opens the known local runCommand renderer. The seeded command is
  never executed. Terminal shows ANSI green stdout, 30 fixture lines and stderr,
  with a success indicator; real result data is joined from the fixture database.
- Actual Plan displays current-turn todos 1/3, current item Implement components,
  and expands all three items. A goal/checklist saved through the actual local
  service displays goal + one tracked item and expands the Task checklist.
- Plain assistant Sources displays two results, expands, and exposes the correct
  AI Elements documentation href. The assistant-with-tools grouped fixture did
  not display its stored citations; that distinct rendering path is not proven.
- Actual Confirmation renders a pending command with numbered Approve/Stop and
  Submit controls. Keyboard option 2 and rejection-reason editing work. Actual Submit was then checked with the supported host
  onToolApproved/onToolRejected hooks returning false before execution. Both
  dispatched the expected message id; rejection carried the exact typed reason.
  Original hooks were restored, pending fixture retired, and no tool executed.
  This verifies UI dispatch, not real approval execution/ownership persistence.
  See ai-approval-host-veto.json. Confirmation width fix measures outer776px /
  children774px, and604px outer at900px viewport; no centered narrow controls.
- Actual keyboard `/` opens Skills entries; fixture screenshot captures menu.
  Actual Enter during an active synthetic runtime enqueues the typed message
  into the real queue state and AI Elements Queue row, clearing the composer.
  Queue fixture was removed before cancellation to avoid dispatching its content.
- Actual Stop button cancels the scoped fixture operation and aborts its returned
  AbortController while retaining typed draft. Initial fixture lacked scope:main
  and was skipped by the domain cancellation filter; correcting fixture scope
  produced status cancelled and signal.aborted true. No gateway cancellation
  assertion is made.
- Fullscreen actual Expand produces composer 1180×888 and editor 1154×824 in a
  1440×1000 viewport. Typing succeeds and scoped Collapse retains appended text.
- Prior removals remain: no Blocks Tools button and no composer OpStatusTray.

## Limits and findings

No real model streaming, gateway stop, approval resume/persistence, actual attachment upload,
IME composition, task client/server execution or goal editing persistence was
validated by this fixture inventory. Specialized HTML/Mermaid render paths were exercised in the additional checks below. Dark/light/narrow
screenshots show actual presentation, not user approval of the design.

A transient HMR circular-initialization error (`TaskDetail Body before
initialization`) was observed during assembly and cleared on cold reload.
Existing DevDock Base UI nativeButton warnings persisted. Code interaction
checks recorded no pageerror. Final screenshots are captured after implementation
commit; WIP diagnostics were moved to /tmp and are not included as final evidence.

## Final screenshot inventory

ai-elements-rich-dark.png / rich-light.png / rich-narrow\.png show reasoning,
terminal output and planning. ai-elements-code-light.png / code-dark.png show
corrected ReUI fences. ai-elements-approval-dark.png / approval-narrow\.png show
full-width Confirmation. ai-elements-sources-dark.png, ai-elements-slash.png and
ai-elements-fullscreen-dark.png cover their actual surfaces. Machine-readable observations: ai-elements-runtime.json; approval dispatch:
ai-approval-host-veto.json. WIP images were moved outside the repository.

## Additional directly changed render surfaces

- Attachments: added a disposable File/Blob PNG to the real file store as a
  successful local draft attachment (no upload). The actual chip opens FileViewer;
  preview image complete=true, natural size480×240. Closing the modal and clicking
  the chip's localized Close removes the file-store entry. A preliminary SVG file
  correctly showed the existing unsupported-preview fallback; PNG verifies the
  actual supported preview path. Blob URL was revoked after cleanup.
- Artifact: a persisted orviloArtifact SVG tag renders the actual AI Elements
  card. Clicking it opens portalStack type artifact with the correct message id
  and identifier; the portal visibly renders Synthetic artifact preview. Clicking
  the card again closes the artifact stack to \[]. Initial lazy-load completion
  was awaited before taking the final open screenshot.
- Mermaid fence: actual SVG contains Synthetic input → Verified preview and a
  valid viewBox. HTML fence renders its static text in the existing sandboxed
  iframe (allow-scripts allow-forms allow-modals, without allow-same-origin).
  Static fixture includes no external resource or script. No pageerror observed.

Additional evidence: ai-elements-attachment-preview\.png,
ai-elements-fence-previews.png, ai-elements-artifact-open.png,
ai-preview-surfaces.json. Source remains d5ddda5fc9eff2c89fa96da3011862c003bc02f3.

## Scoped checks and independent review

Implementation checks used `bun run check` with explicit changed paths (no full
root suite or local root typecheck). Successful batches included 48 Markdown/code
and attachment tests, 55 composer/draft/send/queue tests, 29 approval/state tests,
5 command utility tests, 7 goal tests, and message/action/follow-up/scroll/group
batches (8, 7, 54, 24). Batches can overlap; these are not a unique-test total.
Scoped lint and the native-control/device-boundary commit hooks passed. The
stylesheet/manifest/locales check also passed (one file had no applicable linter).

One independent source review plus its bounded follow-up verified the corrected
React `use` imports, fullscreen height chain and code scrollport fix at
14c4fc51e596db7e696604c7edcb1fcf2c4c8070, with no unresolved confirmed findings in
that scope. Subsequent approval stretching was checked in actual Electron at
its final source SHA above. Full CI/typecheck status is separate from these local
results and must be read from the PR checks.
