# Single Issue status marker

An Issue draws exactly one status mark: its workflow category. Board cards,
list rows, sub-issue rows, the parent reference, the sub-issue progress menu,
the triage row and list group headers all read the same glyph from
`getIssueStatusVisual` in `src/components/ExecutionStatus.ts`.

Orvilo is a Linear-style Kanban for fully automatic multi-agent work. A row
answers "where is this Issue in the workflow"; per-run execution state belongs
to the run history, not to a second mark beside the title.

## Rules

- `workflowCategory` is the Issue Status. `tasks.workflow_category` is
  `NOT NULL DEFAULT 'backlog'`, and `TaskItem.workflowCategory` is required.
- The looser client shapes (`TaskDetailSubtask`, `TaskDetailData`, the triage
  row task) keep it optional. A missing category reads as `backlog`. It never
  falls back to an execution status icon (`TaskStatusIcon`).
- `useTaskWorkflowGlyph` always returns a glyph, so a status slot is never
  empty and never holds two marks.
- No `TaskExecutionBadge` beside an Issue status mark, and no "Scheduled"
  text label on a card or row. A schedule is already shown by `TaskTriggerTag`.
- List grouping and ordering by `status` use the workflow category only:
  group keys are `workflow:<category>`, ranked by `WORKFLOW_GROUP_RANK_MAP`
  (triage, backlog, todo, in progress, in review, done, canceled).

## Surfaces

| Surface                 | File                                                          |
| ----------------------- | ------------------------------------------------------------- |
| Board card              | `src/features/AgentTasks/AgentTaskList/TaskBoardCard.tsx`     |
| List row                | `src/features/AgentTasks/features/AgentTaskItem.tsx`          |
| List group header       | `src/features/AgentTasks/AgentTaskList/TaskGroupLabel.tsx`    |
| List grouping and order | `src/features/AgentTasks/AgentTaskList/listViewOptions.ts`    |
| Sub-issue row           | `src/features/AgentTasks/AgentTaskDetail/TaskSubtasks.tsx`    |
| Parent reference        | `src/features/AgentTasks/AgentTaskDetail/TaskParentBar.tsx`   |
| Sub-issue progress menu | `src/features/AgentTasks/features/TaskSubtaskProgressTag.tsx` |
| Team triage row         | `src/features/WorkTeams/triage/TeamTriageRow.tsx`             |

## Out of scope

- No `needs_input` board column or attention lane. `getIssueStatusVisual`
  takes only `workflowCategory`; an attention overlay would be a separate
  change that also touches `kanbanBoardModel.ts` and the server board keys.
- The board card's generating border still follows the execution status.
- `TaskExecutionBadge` itself stays for the surfaces that show run state as a
  property (for example the task detail properties).
- The tooltip on the status mark keeps its workflow-state id and
  delivery-pending lines.
