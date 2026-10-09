# Issue list keyboard peek

Linear's documented peek, on Orvilo's Issue lists. Frontend only.

## Key map

With focus on an Issue row (or the page body, falling back to the peeked row):

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
- an overlay is open: `role=dialog|alertdialog|menu|listbox`, `aria-modal`,
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
