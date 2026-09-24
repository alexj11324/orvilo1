# PD8 Project Issues row structure verification — 2026-09-24

Verified against commit `302a674e6801ca178c2516e370321f1ff8ee8925` (the staged
diff was committed verbatim; the lint-staged autofix produced no semantic
change and the committed diff was re-reviewed). The candidate was a Brave copy
on CDP `:9222` pointed at the independent Vite `dev:spa` preview on
`localhost:9878` serving this worktree, workspace `ws-useragenttes`, inherited
1250×845 viewport, zh-CN. Committed screenshots and the probe sources live in
[`runtime-acceptance/pd8-issue-rows/`](../../../../runtime-acceptance/pd8-issue-rows/README.md);
all probes ran through `.agents/acceptance/scripts/cdp-inspect.cjs` with
`--match` pinning the tab and `--click` dispatching real `Input.dispatchMouseEvent`.

## Project Issues (`/project/parity-voyager-launch/tasks`)

Populated rows now lead with the clickable status control — `[status][ID][title]`:

- 7/7 rendered rows reported `statusIndex: 0` in the title row: status icon at
  x=275, identifier at x=299, title at x=348 (nested row VYG-2: 311/335/384).
- `[data-task-workflow-state]` count on the page: **0** (was 7 before the
  slice — the duplicate text chip is gone).
- No element precedes the status icon — the inline priority selector is off
  this surface.

## Status control stays functional

A real mouse click on the leading status icon opened the status dropdown with
`Backlog 1 / Pending review 2 / Completed 3 / Canceled 4` and number-key
hints (`status-dropdown-open.png`).

## Priority/status editing stays reachable

- The row context menu enumerates `Status ▸ / Priority ▸ / Copy ID / Copy Link /
Delete` (`project-issues-rows.png` captures the open menu; the probe used a
  synthetic `contextmenu` dispatch against React `onContextMenu`).
- The detail Properties pane still shows and edits `Priority` (Urgent).

## My Issues / Team Issues unchanged

- **My Issues**: `[priority @257][status @281][workflow chip @305][ID @364]`;
  18 `data-task-workflow-state` chips on page (`my-issues-rows.png`).
- **Team Issues**: board cards keep their workflow chips (7) below the title;
  the surface renders through `WorkQueryResults`, which never receives the
  `linearIssueRow` flag (`team-issues-board.png`).

## Quality gates

- Focused Vitest `AgentTaskItem.test.tsx`: 11/11 passed on the identical staged
  diff (not rerun post-commit since the code did not change).
- Scoped lint passed at commit; committed diff re-verified.
- Independent read-only review: no reproducible blocker.
- Per repository rules no local `tsgo` ran; remote Typecheck is the gate.

This is a verified row-structure slice, not whole-page parity. The
group-header `+` / collapse interactions stay frozen as pending
re-verification, the Project Issues board surface does not route through
`TaskList`, and the Linear reference was not re-measured this round.
