# Project Overview / Activity parity ledger

This is an open implementation and verification ledger, **not a parity certificate**.
The overall scope remains all Linear-equivalent pages (ORV-119–128 and the original
handoff). Complete this project-page batch, then continue the remaining inventory;
workspace settings remain last. Full CI and the PRO review are final gates.

## Evidence and method

Reference: authenticated real Linear via CDP 9222. Candidate: isolated Electron
`ud-1`, CDP 9223, local `orvilo-dev` fixture `wave-2-verify-project`.
No writes were made to reference project data.

The 2026-09-22 batch captured both Overview and Activity: visible DOM topology,
semantic controls, computed styles for every rendered text node, and full-window
screenshots. Local raw evidence is at `/tmp/orvilo-project-page-survey/`; it is not
a published, durable artifact. The survey excludes hidden DOM and is not a complete
interaction crawl. Different data and viewport heights mean aggregate counts and
screenshots must not be treated as pixel equality or coverage percentages.

| Surface  | Reference controls / text nodes / style combinations | Electron controls / text nodes / style combinations |
| -------- | ---------------------------------------------------- | --------------------------------------------------- |
| Overview | 164 / 112 / 31                                       | 148 / 89 / 32                                       |
| Activity | 140 / 82 / 26                                        | 157 / 153 / 35                                      |

Reference viewport was 1600×1002; Electron was 1600×900. The counts include the
application shell. Inventory presence is **not** proof that a control behaves
correctly. Use the existing reference-driven transition runner for each scenario,
then independently test persistence on the authorized local fixture.

## Consolidated work queue

| Area                      | Observed reference / required outcome                                             | Current state and next work                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview → update entry   | Navigate to Activity, select Update, expose rich editor and health selector       | Real click verified; no destination hardcoding in comparison logic. Rich toolbar, attachments, project-change summary and agent assistance remain incomplete.                                                                                                |
| Direct Activity / See all | Open Activity in Comment mode, without the Overview Activity summary card         | Reference and Electron real clicks verified. Creation audit row now shared by summary/full feed. Summary currently covers creation only; recent project property history is missing.                                                                         |
| Description               | Direct rich editor, 15px body / 24px line height, collapsible                     | Rich rendering, save/reload, cancel and retained draft verified. Exact reference commit/autosave timing, selection toolbar and richer blocks remain unverified/incomplete.                                                                                   |
| Name / summary            | Editable 24px/600 title and 15px summary, independent persistence                 | Local save/reload/restore verified. Title uses an input rather than reference contenteditable; full keyboard/overflow behavior remains to verify.                                                                                                            |
| Progress                  | Issue-based Scope / Started / Completed; history graph; Assignees / Labels groups | Removed the incorrect goal-completion percentage. Counts now use task business-workflow categories. Historical series, grouping, estimate-weighted percentages and canceled/triage reference semantics remain open; no fabricated graph or weighted formula. |
| Properties                | Status, priority, lead, members, dates, teams and labels are actionable           | Most non-status fields are still static. Batch reuse the existing project planning pickers and update contract; verify save/reload, removal, permission errors and synchronized inline/sidebar values. Status lifecycle mapping also needs review.           |
| Resources                 | Add document or link at the point of use                                          | Candidate currently navigates to its resources page; this is a functional gap, not an equivalent action.                                                                                                                                                     |
| Milestones                | Add, inspect and edit milestones from project context                             | Sidebar currently displays only existing records. Creation/editing interaction and empty-state layout are incomplete.                                                                                                                                        |
| Project navigation        | Reference uses links with `data-active`; candidate uses ARIA tabs                 | Routes match in the tested transitions, but semantics differ. Runner deliberately reports the difference; do not remove accessibility or normalize it into a false pass. Verify open-in-new-tab and keyboard behavior.                                       |
| Layout / typography       | Same reading column, gutters, panel geometry, density and colors                  | Sidebar 300px differs from observed 388px reference; body/card spacing and several action heights differ. Batch after functional controls, at matching viewport sizes; include narrow viewport checks.                                                       |
| Update/comment history    | Rich content, actor, timestamps, health and history actions                       | Markdown body and kind distinction implemented. Full history actions, attachments and error coverage remain incomplete.                                                                                                                                      |

## Data semantics guardrails

### Planning-field verification (working tree, 2026-09-22)

- Priority and start/target dates now use shared editable controls in Overview and
  the sidebar, backed by the project update contract. Other property controls are
  still pending; this is not a Properties parity verdict.
- Real Electron clicks selected High, September 1 and September 30, 2026. Both
  copies synchronized, and a new document reload retained all three values.
  Real clear actions restored both dates/precisions to null and priority to zero.
- The initial live backend returned HTTP 200 and "Project updated" while dropping
  the new priority field. The request carried `priority: 2`, but its response and
  the local database still held zero. Restarting the verified worktree backend
  loaded the changed schema; the same UI action then persisted. Response success
  alone is not an outcome assertion.
- Initial evidence `/tmp/project-planning-persisted.png` exposed truncated sidebar
  dates and an overly spread inline property layout. The shared controls now use
  bounded widths rather than each claiming 100% of their flex row. A fresh Linear
  DOM measurement distinguishes its 388px card from the outer rail; the candidate
  now also renders a 388px card. Opened `/tmp/project-dates-layout-fixed.png`
  confirms both populated dates are readable. Opened
  `/tmp/project-dates-layout-narrow.png` at 900px confirms the rail hides, both
  dates remain visible, and the document has no horizontal overflow. The original
  1600×900 verification viewport and empty fixture dates were restored afterwards.
  Matching reference date-picker behavior, precision modes and error feedback
  still need verification; these captures do not certify whole-page parity.
- Focused dashboard tests: 19 passed. API regression covers merged date-range
  validation, clearing, invalid dates and unauthorized writes. Evidence is from
  uncommitted planning edits over `d6530da73846f99410526d6feb5c14b2fcb40550`, with
  concurrent Dependencies work present; publish revision-labelled evidence with
  the planning-field commit.

### Lead editing (working tree, 2026-09-22)

- Fresh read-only Linear clicks confirmed a searchable single-select lead picker
  with No lead and Invite and add; the members picker is multi-select and also
  offers invitation. Captures: `/tmp/linear-Add-lead.png` and
  `/tmp/linear-Add-members.png`. The label trigger did not match the initial
  button selector, so no label-picker behavior is claimed from that probe.

- Added the missing update contract and shared lead control, including clearing,
  active-workspace membership validation, loading and roster-error retry. API
  regression failed first (the old schema silently stripped the lead), then
  passed. Related checks: 73 tests passed, lint clean.

- Electron selection updated both copies and survived a new-document reload;
  opened `/tmp/project-lead-selected.png` and captured
  `/tmp/project-lead-persisted.png`. UI clearing restored the fixture's null lead,
  confirmed by a scoped database read. The reference was never mutated.

- Invite and add, team-scoped option grouping, exact search presentation, members
  and label editing remain open. This closes the basic lead update path, not the
  whole property-picker parity requirement.

- Progress comes from the authorized project-detail task list, not goals and not
  agent execution success. `in_progress` / `in_review` count as Started, `done`
  as Completed, and canceled issues are excluded from the current scope count.
  These category choices are an explicit local model, **not yet proof** of Linear's
  treatment of every edge case. Validate them before marking Progress complete.

- Missing issue data is unavailable, not zero; a successfully loaded empty list
  is zero. Do not manufacture historical observations from a current snapshot.

- Creation attribution uses the immutable creation snapshot. Legacy records
  without a creator name use an unattributed creation sentence, not the current
  owner/viewer. The timestamp comes from `createdAt`.

## Batch completion gate

### Labels update contract (2026-09-22, ORV-129, working tree)

- Follow-up route integration: 17 tests passed, including malformed UUID rejection,
  unavailable labels not silently stripped, rollback of a concurrent name edit,
  and empty selection. The verified worktree backend was restarted (new parent
  PID 62514, local port 37031) before product replay.

- Seeded only local workspace taxonomy `Parity Label 129`. Electron keyboard
  opening + trusted option click sent labelIds, received HTTP 200, displayed the
  label and retained it after cold reload. Removal sent an empty array, and a
  second cold reload restored Add label. DB confirms zero project bindings while
  the reusable test taxonomy entry remains. Opened persisted/cleared captures:
  `/tmp/orv129-label-persisted.png`, `/tmp/orv129-label-cleared.png`.

- Mouse-open intermittency also appeared on Labels; keyboard opening succeeded.
  Thus persistence is verified, but mouse interaction is NOT certified. Investigate
  the shared picker/driver boundary before closing ORV-129. Captures remain local
  pending upload approval; source remains uncommitted on top of 5f304b71.

- Added the editable multi-select to the properties card using the workspace
  label query and real update action, with loading/error handling and en/zh copy.
  Inline label creation still remains; a plain multi-select is not full parity
  with Linear's create-from-search flow.

- A store regression failed with stale labels after a successful mutation. Label
  edits now read confirmed detail bindings and update retained ID/slug details
  in the initiating cache scope. Focused component/store checks: 39 tests pass,
  lint clean. Electron DOM shows the new control without an error boundary;
  backend restart and real label save/reload are still pending.

- Fresh Linear DOM grounded the trigger as `aria-label="Add labels"` (plural),
  91.5×28; the earlier singular selector was wrong. Opened and dismissed the
  picker read-only and inspected `/tmp/linear-project-labels.png`.

- Existing create accepted label IDs, but update ignored them. A failing real-DB
  regression proved that removing a label retained both bindings. Update now
  accepts UUID label IDs and replaces bindings transactionally under the project
  lock, validates workspace scope, deduplicates, and supports an explicit empty
  list without deleting workspace taxonomy.

- Regression also covers foreign-workspace labels, invalid IDs rolling back a
  simultaneous name edit, and another user being unable to clear bindings.
  Scoped checks: 34 tests passed, lint clean. This is only the backend contract;
  label editing UI, route-level regression and local server reload/product replay
  still remain. No claim of complete Labels parity.

### Member invitation entry (2026-09-22, ORV-129, working tree)

- Members now offers Invite and add for workspace inviters, using the existing
  invitation modal with the real current project ID preselected. The command
  never enters a project-member mutation as a user ID. English and Chinese copy
  are included. Project-only managers do not gain workspace invitation rights.
- Electron replay opened the real modal with Wave2 Verify Project selected,
  Contributor project grant and an empty email field; Send remained disabled.
  No email or invitation was submitted. This proves entry and context, not the
  invitation acceptance/delivery lifecycle or full Linear modal parity.
- Initial replay exposed the member menu reopening above the modal. The source
  picker now suppresses opening until the modal's actual close-completion callback
  (including programmatic close), rather than relying on dismissal alone.
  The fixed screenshot was opened at `/tmp/orv129-invite-dialog-fixed.png`;
  settled DOM confirms both member pickers closed and options hidden.
- Focused lint is clean and 26 component tests pass, including project-scoped
  invitation, no accidental membership writes, inviter permissions, and reopening
  after modal dismissal. Screenshot publication remains awaiting user approval.

### Members working-tree checkpoint (2026-09-22, ORV-129)

- Shared member control now uses existing project membership mutations and roster
  revalidation. Added permission checks for workspace viewers and project managers.
  Existing project roles are not rewritten when adding another member.
- A new regression failed because selected members absent from the active workspace
  roster were disabled. They are now removable; after removal they are not offered
  for re-addition. The focused component suite passes 24 tests with lint clean,
  including rejected additions not appearing as saved membership.
- Opened and inspected `/tmp/project-members-open.png` from the isolated Electron
  fixture against local backend 37031. Both property locations render membership;
  the menu opens with the existing test user selected. This proves rendering/opening
  only, not a completed add/remove/persistence journey.
- The fixture currently offers only its existing administrator. No membership was
  changed in this checkpoint. A distinct active test member is still needed for
  the real mutation/reload/restoration replay. Invite-and-add, trigger styling and
  compact property-row layout remain unresolved against the reference capture.
- These changes remain uncommitted; unrelated Dependencies work is preserved.

### Members live mutation replay (2026-09-22, ORV-129)

- Seeded a distinct local-only workspace member `user_parity_member_orv129`
  (no login credentials or email), then used trusted Electron clicks to add it
  to `prj_38fihH3xZfFh`. Both property controls updated and retained the member
  after a new-document reload. The database recorded contributor membership.
- Removed that same member through the picker and cold-reloaded again: both
  controls returned to the original member, and the test membership was soft
  deleted. The existing `user_agent_testing_001` project role remained `admin`
  and active throughout. The dedicated workspace test user is retained for later
  parity replays; no production membership changed.
- Opened `/tmp/orv129-member-persisted.png` and
  `/tmp/orv129-member-removed.png`. These prove basic membership persistence,
  not visual parity: multiple name chips expand the property row, and invitation
  is still missing. Source is 5f304b71 plus the uncommitted member patch and the
  unrelated Dependencies edits.
- Earlier picker opening was transient/inconclusive; a temporary transition
  probe subsequently observed `trigger-press` opening, and the full add/remove
  replay succeeded after removal of the probe and cold reload. No established
  root cause or fixed picker-opening defect is claimed. Diagnostic code removed.

### Resources client lifecycle (2026-09-22, ORV-130, working tree)

- Added project-link read/save/remove store actions with shared account/project
  cache keys, per-resource pending state and duplicate-submit protection. Failed
  deletion does not remove cached data; pending state clears after failures.
- Successful writes explicitly read back the server list. A readback failure is
  returned separately from the committed write, including the saved resource ID,
  so the eventual form must retry the read rather than create another link.
- A write completing after an account/workspace switch does not initiate a
  readback in the new scope. Read hooks disable themselves without a project ID.
- Fixed the missing `labelIds` field in the project update service input type;
  the existing router/store contract already supports it.
- Scoped checks on service/store/shared keys: 39 tests passed, lint clean;
  `git diff --check` passed. These are client lifecycle checks, not real-product
  evidence. No UI connection, local migration/restart, or CDP resource journey
  has been completed at this checkpoint. ORV-130 remains In Progress.

### Resources UI / version checkpoint (2026-09-22)

- Reference inspection now reaches the real Add link to project dialog by
  clicking the Add a link label itself. URL is required, Title is optional,
  with Cancel/Add link actions. Row-center attempts did not open it; this is
  not an established root cause or a generic detector fix. No reference link
  was submitted. The earlier unintended New document now appears in Resources,
  confirming persistence; the user was informed and it was not deleted.
- Corrected the initial backend assumption that title is required. A model
  regression first failed on omitted title, then passed after accepting omitted
  and cleared titles. Latest backend/store scoped checks: 95 tests pass.
- Overview now opens a local resource menu and real external-link form, with
  links displayed inline and edit/remove actions. Document creation remains
  absent. Link controls use current owner permissions; full role parity is not
  claimed. Existing knowledge-base bindings remain untouched.
- Real isolated Electron CDP on local backend 37031 added
  `https://example.com/orv130-parity` with no title; reloaded; edited its title to
  `ORV-130 link verification`; reloaded again; and removed the same link. The
  database confirmed ID `593c6057-1062-4c9b-9918-4ec2681f3e0d` on creation and
  zero matching rows after removal. No external URL was opened or modified.
- The initial loading state crashed because base-ui has no Skeleton.Button.
  Added a failing render regression and replaced it with the supported Skeleton;
  resource tests now pass 11 cases, and related dashboard/control tests pass 27.
- 0193 migration was measured twice inside a local transaction and rolled back:
  first table creation 58.5ms, empty relation size 0 bytes, cleanup confirmed.
  Then applied only that idempotent SQL to the local database, not the full
  migration runner or production. The local backend was restarted to load APIs.
- Version checkpoints: 77d646ef (detector event witness), 02bfc4ee (backend/state),
  b1c6c3fa (UI). Resource replay used this UI source plus the preserved unrelated
  Dependencies work; captures are local, not published. The PR remains Draft.
- Remaining: document creation/binding, exact dialog position/backdrop/button
  appearance, full role semantics, failed network/permission UI journeys,
  and published same-viewport comparison evidence. No full Resources or
  whole-project parity verdict is claimed.

For each row: reference-state evidence → implementation → behavior regression →
real Electron replay → persistence/error checks where applicable → matching-size
visual comparison. Record unresolved edges explicitly. Only after the entire
inventory is covered may the project-page batch be called complete. Keep issue-body
side-by-side images and revision-labelled PR evidence current; local `/tmp` files
alone do not satisfy the publication gate.
