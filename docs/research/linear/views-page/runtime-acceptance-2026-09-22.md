# Views detail runtime acceptance — 2026-09-22

This is **pre-commit evidence** captured from the dirty worktree based on
`fcbad6e8d48e554a9ff24cf9a0f48d7f349955f0`. It must be re-associated with the
eventual implementation revision before publication.

Runtime: actual Electron renderer on `:9222`, 1440×900 unless noted. Workspace:
local synthetic parity workspace. Reference mutations: none.

## Controlled owner-view journey

1. Started at `/ws-useragenttes/views`.
2. Used New view to create private task view `Views parity runtime`, grouped by Status.
3. Creation returned `view_xyxCjoEQIyWK` and 22 real local task results.
4. Reload preserved the route and definition.
5. Returned to `/views`; `My views · 1` contained a real anchor to
   `/ws-useragenttes/views/view_xyxCjoEQIyWK`.
6. Re-entered the detail through that directory row.

## Click-after results

- Add filter: `aria-expanded false → true`; opened a 444×134.85 dialog containing
  Filters, Add filter, the no-filter state, Cancel, and Save.
- Display options: `aria-expanded false → true`; opened a 444×200.42 dialog containing
  List, Status, Default order, Cancel, and Save.
- Draft behavior: changed List → Board; Save enabled and ordering changed to Manual.
  Cancel closed the dialog and the live details still reported List + Status.
- Details close: removed the labeled aside and changed the first group header width
  from 743px to 1143px, exactly releasing the 400px pane width. Reopen restored
  x=1031, w=400.
- Live details contained private visibility, task entity, list layout, status grouping,
  22 results and status totals (5 todo, 17 completed plus zero-count groups).
- Responsive: at 768px and 390px the detail pane overlaid the results. Body
  `scrollWidth` remained equal to viewport width (768 and 390), so no page-level
  horizontal overflow was introduced. At 390px all three 24px controls remained visible.

## Evidence

- `/private/tmp/orvilo-linear-all-issues-reference.local.png` — local review copy of the
  user-supplied authenticated Linear reference; it is deliberately outside the repository
  and must not be uploaded or attached to a PR.
- `evidence/candidate-owner-detail-after.png` — owner view re-entered from the Views directory.
- `evidence/candidate-list-before.png` / `candidate-detail-before.png` — pre-change baselines.

The disposable view was deleted after these checks, and Electron was restored to the
original Inbox route.

## Post-review hidden-draft replay

After the popover state fix, a second disposable owner view (`view_AIpWczBYiTD9`) proved
the high-risk cross-popover path:

1. Display draft changed from List / No grouping / Default to Board / Status / Manual.
2. Clicking Add filter directly changed the controls to Display=false, Filter=true.
3. Reopening Display showed List / No grouping / Default; the hidden Board draft was gone.
4. Board was selected again and Save was clicked. The saved toast appeared, the detail
   pane reported Board / Status, and a full reload still reported Board.
5. The replacement view was deleted and Electron was restored to `/inbox`.

This replay was performed after the focused transition regression reached 5/5 passing
tests. It confirms both dismissal isolation and a successful persisted Save on the real
Electron path.
