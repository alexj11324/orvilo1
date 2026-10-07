# Web app UI/UX audit notes — October 2026

Findings from a three-layer audit (static code, visual, dynamic journey) of the
main app surfaces — sidebar/nav, inbox, my-issues, task board, chat/composer,
agent surfaces — judged against the DESIGN.md and Linear token gate in force at the time.

This document records historical findings and fixes, not the current normative token contract. The current [DESIGN.md](../../DESIGN.md) owns approved visual roles and scoped measured exceptions; [design-system](../../.agents/skills/design-system/SKILL.md) owns architecture, **react** owns implementation choices, and **ux** owns behavior. Historical classifications such as “13px is drift” and universal mono timestamps below are superseded by those scoped roles. The recorded fixes and evidence remain historical facts, not instructions to repeat the sweep.

## Fixed

### F1 — My Issues fetch storm + permanent skeletons (critical)

`completedWindowQueryFilter(completed, Date.now())` embedded a fresh
`new Date(now - DAY_MS).toISOString()` inside the `queryFilter` object that
`stableStringify` folds into the SWR key — a new key every render, so SWR
issued an unbounded fetch loop (measured \~5,400 requests in 35 s via CDP
Network on `/my-issues`). `isLoading` never settled on fresh keys, so the
board painted permanent skeletons and `AsyncError` could never surface.

Fix: `src/features/MyWork/useMyWorkQueryFilter.ts` memoizes the merged filter
on `[builderFilter, completed, now, visibilityFilter]` — `now` quantized to
the hour so the key is stable while the rolling window still slides on later
renders. Regression test:
`useMyWorkQueryFilter.test.ts` asserts a stable serialized key across
rerenders and a slid window across an hour boundary.

### F2 — Inbox row actions unreachable by keyboard

`InboxListRow.tsx` rendered the read/archive/snooze cluster with
`hidden group-hover:flex` — hover-only, so keyboard users could never reach
the buttons. Now `group-focus-within:flex` too: the row is focusable
(`tabIndex={0}`), so focusing it reveals the cluster and Tab reaches the
buttons. The row `onKeyDown` also needed `event.target !==
event.currentTarget` bail — the revealed buttons bubble Enter/Space to the
row, which suppressed their native activation (Enter) or double-fired
selection (Space). Logic extracted to `inboxRowKeyboard.ts`; tests:
`inboxRowKeyboard.test.ts`. (Independent light review caught this —
the reveal made a pre-existing dead path reachable.)

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

The audit then used a 12/14/16 scale with weights 400/500/600. Fixed across the audited
surfaces: `fontSize: 13` → 12 or 14 (the historical gate treated 13px as drift),
`fontWeight: 450` → 400/500, `font-bold` → `font-semibold`,
`text-[13px]`/`text-[12px]` → `text-sm`/`text-xs` (the linear-tokens gate
rejects arbitrary values on added lines).

### F7 — Close/dismiss icon buttons without accessible names (E2E follow-up)

The recorded E2E pass caught the same F4 class on controls the audit sweep
missed: the Create Task / Create Goal / create / template-detail modal close
buttons, the task-dock dismiss-all button, the Portal thread/topic/local-file
header closes (plus the unlabeled swap-threads control), and the chat alert
dismiss buttons. All now carry `title` (`common.close`, new
`chat.workingPanel.tabs.swapThreads`). Remaining unlabeled X icons exist in
out-of-scope surfaces (Electron titlebar, device manager, settings, chat
terminal) — deferred, documented in the PR.

### F8 — Typography residuals on the audited board (E2E follow-up)

Same E2E pass caught residual drift inside files the sweep touched:
`KanbanColumn` count still 13px/450 → 12px tabular-nums, `TaskBoardCard`
title still 13px → 14px, and the New-view dialog (`ViewDefinitionEditor`)
labels still `text-[13px]` → `text-sm`.

## Won't fix

- `TaskInstruction` description `fontSize: 15, fontWeight: 450` — deliberate
  Linear issue-body parity (15px prose vs the editor's 16/400 default),
  pinned by `railText.test.ts`. An earlier sweep hunk normalized it and was
  reverted; the off-ramp value is intentional, not drift.
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
