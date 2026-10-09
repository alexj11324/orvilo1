# Issue rail controls and accessible names

Round 3 Electron verification findings, fixed in `fix/issue-rail-controls`.

## Issue detail rail

- Status, agent, assignee, reviewer, priority and labels are real ghost `Button`s that fill the
  28px row (`RAIL_CONTROL_CLASS` in `AgentTaskDetail/railControl.ts`). Hover wash, `focus-visible`
  ring and open-state wash come from the Button primitive plus `hover:bg-accent`, the same look as the
  project property pill (`PROPERTY_CONTROL_CLASS` on `origin/fix/project-date-property`; that file is
  not on canary yet, so the class string is replicated locally. Dedupe once it lands).
- The popover pickers (`AssigneeAgentSelector`, `AssigneeMemberSelector`, `TaskLabelSelector`) take an
  optional `control` prop. With it the trigger is a native Button (`PickerTrigger.tsx`); without it the
  trigger is the compact wrapper, now with a `focus-visible` ring. Status and priority already take
  their trigger as `children`, so the rail passes a Button and sets `nativeButton`.
- Placeholders use `text-muted-foreground`. Light value is `--muted-foreground` = `colorTextSecondary`
  is `#666666` (DESIGN.md), 5.74:1 on white (was `colorTextPlaceholder`, 1.92:1).
- Agent picker: the only picker that nested a Base UI `TooltipTrigger` inside its `PopoverTrigger` was
  the agent one (unassigned state). The nested tooltip is replaced by the control's native `title`.
  The failure was not reproduced outside Electron (a jsdom repro with real pointer events opens the
  popover with or without the tooltip), so this removes the one structural difference rather than a
  proven cause.

## Focus rings

List-row and board-card pickers use the same triggers; `PICKER_TRIGGER_FOCUS_CLASS` gives the wrapper
and the status/priority icon spans a `focus-visible` ring.

## Keyboard-operable non-button rows

`shared/pressableProps.ts` makes a clickable row focusable and Enter/Space-activatable where a
`<button>` cannot be used because the row holds a nested menu (Issue artifact rows, the artifact and
acceptance section toggles, the acceptance state pill).

## Accessible names

`Action` (composer actions) now sets `aria-label` from `title` even when the tooltip is suppressed
(`showTooltip={false}` / mobile). That was why the memory, params, search and history composer
buttons were unnamed. Loading placeholders and the Plus fallback got titles; `more` / collapse /
open-run / group sidebar icon buttons got labels. New topic keys: `actions.recentTopics`,
`filter.title`.

### Names for the remaining unnamed controls

- The compact picker triggers (`span role="button"`) of `TaskPriorityTag` and `IssueStatusPicker` carry
  `aria-label` = field + current value (`taskDetail.fieldValue`, e.g. "优先级：高"); the loading spinner
  state keeps the field name. The `div role="button"` wrapper from `pickerTriggerRender` takes a `label`
  (labels / agent / assignee pickers in sub-issue rows). Structure is unchanged: no nested `<button>`.
- The comment send button passes `aria-label` (`taskDetail.sendComment`) through `SendButton`, which
  spreads rest props onto its `Button`.
- `ActionPopover` names its trigger wrapper with the `Action` title; the task-manager agent selector
  button is named "Agent: <current agent>".
- The Project and Milestone rail rows (and the read-only link variants) use `RAIL_CONTROL_CLASS`. They
  previously carried the unlayered `railRow` antd-style class, whose `&& { background }` outranked
  `hover:bg-accent`.
- The inline (sub-Issue) composer keeps plain Enter as a newline: its editor is the multi-line
  instruction, and Cmd/Ctrl+Enter submits, exactly like the main create-Issue dialog.

## Inbox

`InboxListRow` gets the standard row hover wash (`colorFillTertiary`); the selected row keeps its fill.
