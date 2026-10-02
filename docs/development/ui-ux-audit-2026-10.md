# Web app UI/UX audit notes — October 2026

Findings from a three-layer audit (static code, visual, dynamic journey) of the
main app surfaces — sidebar/nav, inbox, my-issues, task board, chat/composer,
agent surfaces — judged against DESIGN.md and the Linear token gate.

## Fixed

### F1 — My Issues fetch storm + permanent skeletons (critical)

`completedWindowQueryFilter(completed, Date.now())` embedded a fresh
`new Date(now - DAY_MS).toISOString()` inside the `queryFilter` object that
`stableStringify` folds into the SWR key — a new key every render, so SWR
issued an unbounded fetch loop (measured \~5,400 requests in 35 s via CDP
Network on `/my-issues`). `isLoading` never settled on fresh keys, so the
board painted permanent skeletons and `AsyncError` could never surface.

Fix: `src/features/MyWork/useMyWorkQueryFilter.ts` memoizes the merged filter
on `[builderFilter, completed, visibilityFilter]`, making the key stable
across renders. Regression test:
`useMyWorkQueryFilter.test.tsx` asserts a stable serialized key across
rerenders.

### F2 — Inbox row actions unreachable by keyboard

`InboxListRow.tsx` rendered the read/archive/snooze cluster with
`hidden group-hover:flex` — hover-only, so keyboard users could never reach
the buttons. Now `group-focus-within:flex` too: the row is focusable
(`tabIndex={0}`), so focusing it reveals the cluster and Tab reaches the
buttons. No regression test: the fix is a CSS-class change and the only
practical assertion would render the component or match class strings —
exempt per AGENTS.md.

### F3 — Identifiers not in mono

`AgentTaskItem` (`font-family` sans at 13px/450), `TaskBoardCard`, and
`InboxListRow` rendered resource identifiers (`T-7`, `QA-1`) in the UI sans
face. DESIGN.md/Linear convention: IDs are `fontFamilyCode`, muted. Now
`font-mono` (`cssVar.fontFamilyCode` in the static style) at 12px.

### F4 — Unlabeled icon buttons

`ActionIcon` feeds both tooltip and `aria-label` from `title`; the
Clock3/PanelRightClose icons in `AgentTaskManager`, `PageEditor/Copilot`, and
`AgentGoals/GoalChat` toolbars had none — verified `aria-label === null` live
via CDP. Same gap in the shared `ModalClose`/`AlertModalClose` atoms
(`src/components/Modal/atoms.tsx`). All now carry `title` / `aria-label`
(`topic.actions.showTopics`, `chat.workingPanel.tabs.closePanel`,
`common.close`).

### F5 — Timestamps not in mono

`AgentTaskItem` time node, `TaskBoardCard` scheduled/created dates, and
`InboxListRow` age now use `font-mono` (numbers are code-family per the
token rule).

### F6 — Off-ramp typography sweep

Type scale is 12/14/16 with weights 400/500/600. Fixed across the audited
surfaces: `fontSize: 13` → 12 or 14 (13px is treated as drift),
`fontWeight: 450` → 400/500, `font-bold` → `font-semibold`,
`text-[13px]`/`text-[12px]` → `text-sm`/`text-xs` (the linear-tokens gate
rejects arbitrary values on added lines).

## Won't fix

- `···` no-priority glyph on task cards — `PRIORITY_ICONS[0]`, intentional
  Linear convention, not a defect.
- `ui/sheet.tsx` / `ui/dialog.tsx` close buttons already carry sr-only
  labels — only `components/Modal` atoms had the gap.

## Strengths observed

- `SidebarNavItem` lazy-mounts action buttons on hover+focus.
- `WorkInboxPage` / `MyWorkPage` implement the full error/empty/loading
  matrix.
- `InboxListRow` already had `aria-current`, labeled option buttons, and
  Enter/Space activation.
- Modal atoms expose `maskClosable` + keyboard-dismiss semantics.
