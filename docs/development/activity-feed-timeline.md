# Activity feed on ReUI Timeline

The project Activity page (`src/features/Projects/Activity/ProjectActivityPage.tsx`) now renders its
stream with the ReUI `Timeline` (`src/components/reui/timeline.tsx`, installed with
`npx shadcn@latest add @reui/timeline`).

## What changed

- Every line is one `ActivityTimelineItem`: a 28px bordered circular slot holding exactly one 14px
  mark, a neutral vertical rail between slots (`border-border`, never `primary`), 14px body copy in
  `text-muted-foreground` and a 12px `TimelineDate`.
- The feed never marks steps complete (`Timeline value={0}`), so ReUI's `primary` "completed" tint
  never applies.
- The actor appears in the sentence as text only. A line that previously drew a glyph and a second
  avatar now draws one mark.
- Comments / health updates keep their bordered card as the item content. `ProjectUpdateRow` gained
  `hideAuthorAvatar` so the author's avatar is the slot mark instead of appearing twice.
- The project creation line is the last item of the same timeline.

## Mark rules

`activityMarkers.ts` is the pure mapping (unit-tested); `ActivityMarker.tsx` renders it.

| Line                                   | Mark                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Issue created                          | Issue workflow mark, backlog category (not a plus glyph)                                                                              |
| Status changed                         | Workflow mark of the new status: backlog, scheduled to todo, running to in progress, paused to in review, completed to done, canceled |
| Status changed to `failed` / unknown   | Status property mark (no category fits)                                                                                               |
| Priority changed                       | Priority icon of the new level                                                                                                        |
| Assignee / reviewer changed            | Actor avatar; user-less system change uses the assignee glyph                                                                         |
| Automation changed                     | Timer glyph                                                                                                                           |
| Milestone added                        | `MilestoneIcon` diamond                                                                                                               |
| Project started / completed / archived | Play / badge-check / archive glyph                                                                                                    |
| Review accepted / rejected             | Badge-check / circle-x glyph                                                                                                          |
| Comment or health update               | Author avatar                                                                                                                         |
| Project created                        | Project entity icon                                                                                                                   |

## Not covered

- The Issue detail activity list (`AgentTaskDetail/TaskActivities.tsx`) is not migrated. It mixes
  comment cards, run topics, briefs and system lines, with a filter bar, a collapsible section and
  a "result" variant that hides the system lines; the rail there is broken on purpose by cards.
  Moving it onto Timeline would change that behavior and exceeds a mechanical swap.
- A created Issue uses the backlog mark because the creation event carries no status. The unmerged
  single-status-marker work (`getIssueStatusVisual`) should replace the direct
  `WORKFLOW_CATEGORY_VISUALS` lookup once it lands.
- Electron / visual verification of both themes has not been done.
