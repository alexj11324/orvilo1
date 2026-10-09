# Issue list keyboard peek

Linear's documented peek, on Orvilo's Issue lists. Frontend only.

## Key map

With focus on an Issue row inside its owning surface:

| Key               | Action                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| `Space`           | Toggle the peek pane for the row. Arms "Open details" if it was off.      |
| `J` / `ArrowDown` | Next Issue in the visible order. An open peek follows. No wrap at the end |
| `K` / `ArrowUp`   | Previous Issue. Same rules.                                               |
| `Enter`           | Open the full Issue page for the row.                                     |
| `Esc`             | Close the peek and put focus back on the row it showed.                   |

"Visible order" is the rendered order: grouping, sub-grouping, filters and
collapsed groups already applied (collapsed groups contribute no rows; muted
parent-context repeats are skipped). With nothing current, `J` starts at the
first row and `K` at the last. If the current Issue just left the list (a filter
change) the keys do nothing until a row is chosen again.

Opening the peek never takes focus, so `J` / `K` keep working. A virtualized row
that is not mounted is scrolled into view first (`scrollToIndex`), then focused.

## Guards

Nothing fires when:

- the key comes from `input`, `textarea`, `select`, `contenteditable`,
  `role=textbox|combobox|searchbox` — the peek's title and description editors
  are covered by this;
- a visible overlay is open: `role=dialog|alertdialog|menu|listbox`, `aria-modal`,
  the command palette (`[cmdk-root]`) or any open Base UI trigger
  (`[data-popup-open]`). Overlays own their keys, including `Esc`;
- `Cmd`, `Ctrl`, `Alt` or `Shift` is held;
- focus is outside the list and the peek pane (sidebar, toolbar, header);
- `Space` / `Enter` target a real control inside the row (status / priority /
  assignee triggers, links) or inside the pane — they keep their native meaning;
- `Space` / `Enter` / `Esc` are auto-repeating;
- `Esc` and no peek is open (it is not swallowed).

The arrow keys only drive the list from the list or the page body; inside the
peek pane they scroll it (`J` / `K` still work there).

## Implementation

- `src/features/WorkSurface/issuePeekKeyboard.ts` — pure `reduceIssuePeekKey`
  (ids, current id, peeked id, key -> focus / peek / open page) and key mapping.
  Shared by every host; unit-tested.
- `src/features/WorkSurface/issuePeekKeyContext.ts` — DOM guards
  (`resolveIssueKeyScope`) and row lookup.
- `src/features/WorkSurface/useIssuePeekKeyboard.ts` — the hook. One `keydown`
  listener on `document` in the **capture** phase. It is deliberately not
  `react-hotkeys-hook`: a focused row is `role="button"` and already navigates on
  `Space` / `Enter` in a React handler, which runs before a bubbling document
  listener. Capturing first lets the hook claim the key only when it applies.
- Rows carry `data-issue-row="<identifier>"` (`AgentTaskItem`); the pane root
  carries `data-issue-peek-pane`.
- The shared lists own the visible order and the virtualizer, so they mount the
  hook: `WorkQueryVirtualList` (via `WorkQueryResults`'s `onPeekTask`) and
  `TaskList` (`onPeekTask`). Hosts pass only a callback: `null` closes, a task
  opens / follows. The host decides what "open" means (it arms Open details).

These are page-local keys, so they are not in `HOTKEYS_REGISTRATION` (same as
the Inbox list keys). The registry has no bare `Space`, `J`, `K`, `Enter` or
`Esc` binding (it holds `mod+k`, `mod+j`, `c`, `g>i|m|d|p|v`, `alt+enter`,
`mod+s`, ...), so there is nothing for the cross-scope conflict check (#594) to
reject.

Also fixed here: `AgentTaskItem`'s root is `role="button"`, so
`isInteractiveRowClick` matched the row itself and a plain click on row text
never selected into the peek. The row root now carries `data-issue-row` and is
not counted as interactive; a control inside it still is. The duplicated copy in
`myWorkDisplay.ts` now re-exports the one in `peekTrigger.ts`.

## Hosts

| Host                              | Peek                                    | Keys                                                                                                                                                                       |
| --------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| My issues (`MyWorkPage`)          | `MyWorkIssuePane`                       | All. Space arms Open details and selects; Esc / Space clears the selection.                                                                                                |
| Team issues (`TeamIssuesSurface`) | `MyWorkIssuePane`                       | Same as My issues.                                                                                                                                                         |
| Project issues (`AgentTasksPage`) | `IssueDetailPane`, project scope only   | All, in both the grouped (`WorkQueryResults`) and plain (`TaskList`) list. Space arms the pane; Esc / Space on the peeked row closes it (same as the header close button). |
| Inbox (`WorkInboxPage`)           | Master / detail, always shows selection | Already had `J` / `K` / arrows / `Enter` / `Esc` (`useInboxListKeyboard`) and `alt+u`; untouched. `Space` is not a peek there.                                             |
| `/tasks` (no project)             | None                                    | Not added. Rows stay Tab-focusable; `Enter` / `Space` on a row navigate as before.                                                                                         |

`WorkQueryResults`' non-virtual `flatSections` branch has no hook; no host passes
`flatSections` today.

Board layouts are out of scope (cards own their clicks). `SavedViewPage`'s side
panel is the view's details, not an Issue peek.

## Known limits

Keyboard ownership is scoped to the list's stable `WorkSurface` root, including
its peek pane. Opening details may remount the list beneath that same root, so
pending focus restoration uses the replacement list's reveal callback. Split
panes keep independent focus requests and reveal callbacks; a retained hidden
tab, its duplicate rows, or its hidden overlays cannot claim another pane's
keys or focus. Visible modal/menu guards still own the keyboard.

Verification of that boundary includes two visible lists with identical Issue
identifiers, a retained hidden duplicate list, and virtual-row reveal after a
layout remount. Electron acceptance is still required against the packaged
revision; DOM regression tests do not establish native split-view acceptance.

- Project issues with Open details armed but nothing selected: `Esc` does not
  close the empty pane (there is no peeked Issue); use the header close button.
- `J` / `K` while that empty pane is open move focus only; the pane starts
  following once an Issue is peeked.

## Overlay guard, row keys, list freshness

- **Open overlays only.** `Modal` mounts every popup with `keepMounted`, so a
  closed dialog stays in the DOM with `role="dialog"`. Base UI marks it
  `data-closed`; the guard (`isOpenIssueOverlay`) ignores anything that is
  `data-closed` (itself or via an ancestor) or hidden, and only treats a trigger
  as an open overlay when it is a popup trigger (`aria-haspopup` +
  `data-popup-open`), so a hovered tooltip trigger does not block the keys.
- **Rows are addressed by key, not identifier.** A list that can show an Issue
  twice wraps each row in `data-issue-slot="<section>:<id>"` and passes the keys
  as `ids` plus `idOf`. `workQueryVirtualPeekRows` / `taskListPeekRows` emit one
  key per rendered row (a collapsed section emits none); focus, reveal and the
  peek's follow behaviour all use that key. Lists without slots keep identifier
  keys. The attention group axis itself puts each Issue in exactly one group
  (`attentionGroupExpr` CASE in `packages/database/src/models/workQuery.ts`).
- **Edits reach the list.** `refreshTaskList` also revalidates the work-query
  roots (`isWorkQueryTaskRowsKey`), and `updateTask` refreshes the lists after a
  rename or due-date change. Deleting an Issue goes through `refreshTaskList`,
  so My issues / saved views / team lists drop the row.
- **Narrow rows.** `AgentTaskItem` is an `issue-row` size container: labels hide
  below 760px, the milestone below 640px and the project chip below 540px, so
  chips never overlap the identifier and title when the peek narrows the list.

## Collapsing a group while the peek is open

Measured in Electron: with the peek open, collapsing a later group rendered the
wrong rows (earlier rows missing, a row of the collapsed group in their slot) and
`J` walked into hidden rows. Collapsing with the peek closed was fine.

- **Cause.** `WorkQueryVirtualList` passed `data={sections.items}` to
  `GroupedVirtuoso`. react-virtuoso 4.18 (`dist/index.mjs`, list-state builders
  `Jn` / the `Ft`/`Et` pushes, `wn`) looks `data` up by FLAT slot index, where
  every group header is a slot, and sizes the first layout by `data.length`. A
  rows-only array is therefore read shifted by the number of headers before the
  row, and a collapsed (zero-row) group shifts every later row once more. The
  keyboard model (`peekRows`) walked `sections.items` by item index, so the
  rendered rows and the rows `J` / `K` walk disagreed. Which path runs depends on
  whether the virtualizer has a measured viewport yet; the split layout that the
  pane opens (a fresh list instance under a different scroll parent) is the case
  that hits it. A real GroupedVirtuoso under `VirtuosoMockContext` reproduces the
  shift and truncation with `data` and renders every case correctly without it;
  that probe was not committed (no React render tests), so the Electron check
  below is the acceptance.
- **Fix.** No `data` prop. `itemContent(index)` resolves the row from
  `sections.items[index]` (the exact array `workQueryVirtualPeekRows` walks) and
  `computeItemKey(index)` reads `stickyFlatKeys(sections)[index]` (flat slot
  keys: group slots and rows). `groupCounts`, items, keys and peek rows all come
  from the one `sections` snapshot of the same render, and the renderer and the
  peek helper read the same `collapsed` set.
- **Collapsing the peeked Issue's group closes the peek** (`groupHidesIssue`,
  lanes included) and focus lands on that group's header
  (`data-work-group-header`). Closing re-parents the list, so the pending focus
  key lives in module scope and the replacement list consumes it.

## Project Issues layout and Tab

- The project Issues peek pane is a 400px column. While it is open the project
  layout hides its right-hand 属性 (properties) panel (`ProjectPanelPeekContext`:
  the Issues tab calls `useSuppressProjectPanel(peekOpen)`, `ProjectLayout`
  derives `visible = viewport && section && !suppressed`). The panel stays mounted
  (`hidden`), its own state and the user's setup are untouched, and it returns
  when the peek closes. Measured at 1200x800 the surface goes from \~498px to
  \~933px, so list + peek sit side by side with a \~530px list. Only when the
  surface is still under 900px (`@container work-surface`) does the pane overlay
  the list (My issues / Team issues rule). The pane is `z-index: 10` above an
  `isolate` list wrapper, so a focused row's ring cannot paint over it.
- The row's date box is `min-width: 48px` (was a fixed `width: 48px`), so a long
  date no longer runs past the row's right edge.
- Composers (`CreateTaskInlineEntry`, `CommentInput`) pass `tabMovesFocus` to
  `EditorCanvas`: Tab / Shift+Tab leave the editor instead of inserting a tab
  character (the list plugin's Tab handler was the trap). Ctrl / Alt / Meta+Tab
  are untouched. Enter / Cmd+Enter are not changed. Pure rule: `tabLeavesEditor`
  in `registerTabFocusEscape.ts` (a caret in a list item does not claim Tab; the
  handler runs at `COMMAND_PRIORITY_HIGH`, so returning `false` lets the list
  plugin's `COMMAND_PRIORITY_EDITOR` handler run). That handler
  (`@lobehub/editor` `plugins/list/plugin/registry.js:18-23`) indents only when
  `$indentOverTab` is true (caret at the start of the block); anywhere else in
  the item it inserts a tab character. So "Tab indents inside a list" holds for a
  caret at the start of the item only.
- The Issue DESCRIPTION editor (`TaskInstruction`) does NOT pass `tabMovesFocus`
  and this branch does not touch it, so its Tab behaviour is the library's and is
  identical on `origin/canary`: `STATIC_PLUGINS` registers `ReactListPlugin` via
  `createChatInputRichPlugins` (`InternalEditor.tsx`), whose Tab handler inserts a
  literal tab at a mid-item caret and indents a plain paragraph by 40px when the
  caret is at its start. Not changed here.

## Duplicate rows, headers

- **Navigation state is the row key.** With the peek open and focus not on a row
  (focus lost on a layout remount, or inside the pane) the hook used to resolve
  the peeked Issue id back to its FIRST listed row, so J from the second copy of
  an Issue continued from the first copy. `resolvePeekRowKey` now trusts the
  focused row, then the row key the keyboard / focus last sat on (`focusin` and
  every move are recorded per surface, so it survives list remounts), and only
  then the first copy.
- Which rows count: the server's attention axis puts each Issue in exactly one
  group (`attentionGroupExpr` CASE), so two groups showing the same Issue come
  from a multi-valued axis (labels) or from a muted parent-context repeat. A
  muted repeat (`opacity-50`, `data-issue-context`) is deliberately not a row J
  visits (`workQueryVirtualPeekRows` skips `parentContext`); a full-opacity copy
  is visited.
- **J / K from a group header.** A focused group header button used to be outside
  the keyboard scope. `resolveIssueKeyScope` now reports `headerKey`
  (`data-work-group-header`), and `reduceIssuePeekHeaderKey` moves to the first
  row after the header (J) or the last row before it (K), over the `order` that
  `workQueryVirtualPeekRows` emits (headers and rows in render order; collapsed
  groups contribute no rows). An open peek follows. Space / Enter on the header
  keep toggling the group. Only `WorkQueryVirtualList` headers carry the
  attribute; the plain `TaskList`'s group labels are unchanged.

## Collapse focus ownership

Collapsing the group containing the peeked Issue closes that peek. The pending
header focus is keyed by its stable WorkSurface element, so list remounts retain
it and another split or retained pane with the same collapse key cannot consume
it. Restoration requires a visible header in that same owner, and the intent is
consumed only after focus succeeds. The list also observes child mounts so a
virtualizer's later header render can complete restoration without a parent
render. Observation disconnects when the list unmounts.

Existing non-React DOM regressions exercise sibling panes, independently pending
owners, a hidden retained pane, and replacement-list/delayed-header restoration.
They cover the focus helper; fresh Electron grouped-list acceptance remains
pending for the current revision.
