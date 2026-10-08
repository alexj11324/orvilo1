# Issue pages: shadcn and ReUI compliance

An audit of the issue detail page (`src/features/AgentTasks/AgentTaskDetail/**`) and the
selectors it mounts (`src/features/AgentTasks/features/**`) against the shadcn skill rules and
the ReUI audit checklist. Project owners win where they disagree with generic shadcn advice:
[AGENTS.md](../../AGENTS.md), [DESIGN.md](../../DESIGN.md) and the
[React skill](../../.agents/skills/react/SKILL.md). In particular this project uses the Base UI
`render` prop rather than `asChild`, and keeps the recorded 13px rail and 15px description
type roles.

The refactor is behavior-preserving. The only intended behavior change is that controls which
were mouse-only can now be reached and operated from the keyboard.

## Rules applied

| Rule                                                           | What changed                                                                                                                                                                   | Files                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Use `Button`, not a clickable `div` or raw `button`            | Due date value, project and milestone rows, relation rows and relation search hits are local `Button`s. Read-only project and milestone rows are real links (`WorkspaceLink`). | `TaskProperties`, `TaskProjectSection`, `TaskPrerequisites`                                                         |
| No nested interactive elements                                 | `Link > Button` becomes `Button render={<Link />} nativeButton={false}`.                                                                                                       | `TaskDetailPage`                                                                                                    |
| Base UI triggers: `render` with a non-button needs the flag    | Menu and popover triggers that render a `div` or `span` declare `nativeButton={false}`, so Base UI adds the button role, tab stop and Enter/Space handling.                    | `IssueStatusPicker`, `TaskLabelSelector`                                                                            |
| Menu items inside their group                                  | `DropdownMenuItem`s are wrapped in `DropdownMenuGroup`.                                                                                                                        | `TaskProperties`, `TaskProjectSection`, `TaskPrerequisites`, `TaskPriorityTag`, `IssueStatusPicker`                 |
| `className` is for layout, not colors                          | "Add property" uses the ghost 28px `Button` as is; its rail alignment is a container-scoped negative margin.                                                                   | `TaskProperties`, `taskDetailLayoutStyles`                                                                          |
| Icons take the component's size                                | Manual `size` removed from icons inside `Button` and `DropdownMenuItem`; the leading icon carries `data-icon`.                                                                 | `TaskProperties`, `TaskProjectSection`                                                                              |
| Accessible names and decorative icons                          | Picker search fields and the attach button get `aria-label`; decorative marks get `aria-hidden`.                                                                               | `AssigneeAgentSelector`, `AssigneeMemberSelector`, `TaskLabelSelector`, `TaskInstruction`, `TaskPrerequisites`      |
| Loader selection                                               | `Loader2Icon` with `animate-spin` becomes the local `Spinner`.                                                                                                                 | `TaskPriorityTag`, `IssueStatusPicker`                                                                              |
| `cn()` for merged and conditional classes                      | Template-literal and ternary class names go through `cn()`.                                                                                                                    | `TaskDetailSections`, `TaskDetailTitleInput`, `TaskProjectSection`, `TaskPrerequisites`, `TaskProperties`, skeleton |
| Semantic tokens, no raw colors                                 | `text-amber-500` becomes `text-warning`; inline `cssVar` colors become the existing placeholder class or `text-muted-foreground`.                                              | `TaskPrerequisites`, `TaskDetailAssignee`, `menuExtra`                                                              |
| Scale utilities, no arbitrary values                           | `text-[12px]` becomes `text-xs`, `w-[260px]` becomes `w-65`, equal width and height become `size-*`.                                                                           | `TaskProjectSection`, the three popover selectors                                                                   |
| Utilities instead of inline `style`                            | `min-w-0`, `flex-none`, `truncate`, `relative`, `overflow-y-auto`, `px-2`, `inline-flex`, `pointer-events-none`.                                                               | `TaskDetailPage`, `TaskProjectSection`, `TaskPrerequisites`, `TaskInstruction`, selectors                           |
| Reuse before writing                                           | The agent selector's private trigger style is replaced by the shared `pickerTriggerStyles`.                                                                                    | `AssigneeAgentSelector`                                                                                             |
| External links carry `rel="noopener noreferrer"` (ReUI)        | The pull request link.                                                                                                                                                         | `RunIntegrationTag`                                                                                                 |
| Loading skeleton mirrors the page (`Skeleton` for known shape) | Rewritten on the live layout classes; see below.                                                                                                                               | `TaskDetailSkeleton`                                                                                                |

## Skeleton

`TaskDetailSkeleton` reuses `taskDetailLayoutStyles`, so the container query places it exactly
like the loaded issue: title, the "Sub-issue of" line, the properties as a wrapping strip under
the title in a narrow pane or as the 232px rail with a "Properties" label and three rows in a
wide one, then the description and the body. The removed label column (which resolved to an
undefined class), the header chips, and the 32px control with an overlay radius are gone.

The skeleton cannot know whether an issue has a parent, so the parent line is always drawn.

## Deliberately unchanged

- **13px rail values and the 15px/450 description.** DESIGN.md records both as scoped roles and
  `railText.test.ts` pins them. They stay inline through `RAIL_VALUE_FONT_SIZE`.
- **`@/components/Avatar`.** It is the local adapter and derives its fallback from `name`, so the
  shadcn `AvatarFallback` rule does not apply.
- **Picker search fields.** The selectors keep a bare `input` (or an `Input` whose chrome is
  reset). The compliant form is a Combobox or Command primitive, which is a redesign of five
  pickers and not a behavior-preserving swap. The same holds for the relation search box, which
  would become an `InputGroup`.
- **`maxHeight: '50vh'` on picker lists.** ReUI asks for a parent-owned height. Doing that
  needs the popover's available-height variable and changes scrolling behavior.
- **Priority urgent color (`cssVar.orange`).** A palette primitive, but the semantic warning
  role is a different gold. The priority palette is owned by `PriorityIcon`.
- **List-row `Button`s carry `justify-start` and `font-normal`.** A row is not a centered,
  medium-weight label; these undo label layout rather than recolor the control.
- **`TaskTriggerTag`, `TaskVisibilityChipLabel` and the acceptance, verify, schedule and run
  sub-features** (`TaskAcceptance*`, `TaskVerifyConfig`, `TaskScheduleConfig`, `RunVerify*`,
  `RunSubtasksPreview`, `GoalRound*`, `TaskArtifacts`, `TaskBriefCard`, `CommentInput`,
  `TopicChatDrawer`). They still hold template-literal class names and `text-[12px]`; they are
  a second, purely mechanical pass kept out of this change to keep it reviewable.

## Files owned by other open changes

These were audited but not edited, because other pull requests are rewriting them.

| File                          | Findings                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskSubtasks.tsx`            | Two clickable `div` headers (collapse, add sub-issue) with no keyboard path; `Tree` from the legacy `@lobehub/ui/base-ui`; inline `cssVar` colors; inline layout styles.                                   |
| `TaskActivities.tsx`          | A clickable `div` header that also contains buttons; three raw filter `button`s that should be a `ToggleGroup`; inline colors and weights; template-literal class names.                                   |
| `CommentCard.tsx`             | Icon-only `ActionIcon` without a label; `rounded-md` fighting an inline overlay radius on a card (card role is 8px); `text-[12px]`; template-literal class names; menu items outside a group; icon `size`. |
| `TaskParentBar.tsx`           | Inline layout styles (`minWidth`, `maxWidth`, `flex`); a `TooltipTrigger` inside a `Button`.                                                                                                               |
| `TaskDetailHeaderActions.tsx` | Icon-only `ActionIcon` trigger without `title` or `aria-label`.                                                                                                                                            |
| `TopicCard.tsx`               | `text-[12px]`, inline `flexShrink`.                                                                                                                                                                        |
| `useTaskCopyActions.ts`       | No findings.                                                                                                                                                                                               |

## ReUI checklist

- **No invented APIs.** The only ReUI component on these pages is `Badge`
  (`@/components/reui/badge`, imported as `Tag`). Every call site passes `size`, `style`,
  `title`, `onClick` or children only, all of which the component source accepts.
- **Open: clickable badges.** `RunVerifyTag` and `RunIntegrationTag` put `onClick` and a pointer
  cursor on a `Badge`, which renders a `span`: mouse-only. The fix is the badge's own `render`
  prop with a `button`. They are drawn inside `TopicCard`, which another change owns, so this
  is listed rather than changed here.
- **Semantic tokens, accessibility, `rel`.** Covered in the table above.
- **No `dangerouslySetInnerHTML`** in scope.
- **Map over typed arrays.** The skeleton rows now map over constants instead of repeating JSX.
- **Scroll regions.** The not-found and error shells use `min-h-0` in a flex chain. The picker
  lists are the open item listed above.
- **Installed component files.** Nothing under `@/components/ui/*` or `@/components/reui/*` was
  edited.
