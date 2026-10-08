# Project controls aligned with Issue controls

Project property controls and status glyphs now share the Issue surfaces' control shape. This is a hand-ported slice of `codex/issue-ui-corrections` commit `f3b97c32c`; only the property-control and status-icon parts were taken.

## Property controls

- Labels, lead and members open from a ghost `ComboboxTrigger` pill (28px high, 13px medium text) with the search input inside the popup, replacing the inline chip inputs. Members show an `AvatarGroup` (up to three) followed by the names; lead shows the selected member's avatar.
- Priority reuses `TaskPriorityTag`, so Project and Issue priority share one menu; the picked number is narrowed with `resolvePriorityLevel` before saving. The trigger is a ghost `Button` whose accessible name is `properties.priority`; it is a `button`, no longer a `combobox`.
- The status trigger in the Overview header and in the Properties rail is a ghost `Button` with the same pill shape. The rail no longer wraps the status in an outline `Badge` with a chevron.
- `ProjectUpdateComposer` on the Overview is keyed by project id, so switching projects remounts the composer instead of carrying its state across.

## Status icons

- `ProjectStatusIcon` draws every lifecycle status on the measured hexagon perimeter exported as `PROJECT_STATUS_PERIMETER` from `ProjectActiveStatusIcon.tsx`. `active` keeps its progress mark; the other statuses add their own inner glyph instead of a lucide icon.
- The default size is 16, and the create dialog, tab tag, filter popover, board column, timeline row, list row and group header all pass 16.
- The timeline row renders `ProjectStatusIcon` inside a labelled `role="img"` wrapper instead of branching between two icon components.

## `nativeButton`

`TaskPriorityTag` takes a `nativeButton` prop (default `false`, matching its span icon trigger). Callers that pass a real `<button>` child, as the Project priority field does, set it so Base UI does not add a second button role or double-handle Enter and Space. `IssueStatusPicker` passes `nativeButton={false}` because its trigger node is not a native button.

## Landed elsewhere

- The removal of `OrchestrationPolicyCard` and of the project orchestration policy API, model, service and store members is PR #542 (`refactor/retire-project-orchestration-policy`). This change does not touch the card, so the two merge independently.
- Activity and Updates changes (`ProjectActivityPage`, `Updates/*`) and their draft tests are PR #527 (`fix/project-update-draft-and-typography`).

## Kept differences from the source commit

- The property pills use `hover:bg-accent` instead of the source's `hover:bg-muted`, following the repository-wide accent hover wash.
- The team chip in the Overview header keeps its `antd-style` class (`teamChip`). `--accent` resolves to the same fill token (`colorFillTertiary`) the class uses on hover, so the chip and the ghost pills beside it share one hover surface without utility-class overrides of the anchor color.

## Verification

`bun run check` on the changed files: lint clean, related tests passed. `src/features/Projects`, `src/features/AgentTasks/features` and `TaskProperties.test.tsx` were also run directly with Vitest: 35 files, 385 tests passed. `TaskPriorityTag.test.tsx` covers opening a native button trigger once with Enter and with Space. `TaskProperties.test.tsx` covers opening the Issue detail status trigger once from the keyboard, the workflow glyph on every status row, and moving a pending-review Issue back to Todo. Native Electron visual acceptance has not been captured for this revision.
