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

For each row: reference-state evidence → implementation → behavior regression →
real Electron replay → persistence/error checks where applicable → matching-size
visual comparison. Record unresolved edges explicitly. Only after the entire
inventory is covered may the project-page batch be called complete. Keep issue-body
side-by-side images and revision-labelled PR evidence current; local `/tmp` files
alone do not satisfy the publication gate.
