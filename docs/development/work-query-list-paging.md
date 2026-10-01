# Work query list paging

Issue lists that execute a work query page their groups on the server. My Work,
team issues, saved views, and a filtered project issue list share that path.
The group total is the server count for the query, including rows that have
not been loaded yet.

## Grouping

A list `groupBy` may be status, workflow category, priority, assignee,
attention, project, cycle, or activity date. `subGroupBy` nests a second axis
under the first. The server returns each group's total and a cursor. The next
page of one group returns only that group; the client keeps groups it already
holds and does not mark a sibling as having more rows.

Activity-date buckets use the viewer's IANA time zone. Inside an activity-date
group, and in activity mode when the board is not manually ordered, rows follow
notification activity and then task id. A manual board still orders by card
position so a same-column drag persists.

When a second axis is set, a list cell pages 25 rows and a board swimlane cell
pages 10. Empty list sub-groups are omitted. Empty board columns still follow
the board's existing empty-column rules.

## Virtual list

Work-query lists render through a virtual list. Group headers stick to the
top of the scroll area. A nested lane keeps its parent header in that sticky
stack. Collapsing a group removes its rows from the window. My Work stores
collapsed groups with the display options. Team issues store them in the
`groups` URL parameter. A saved view keeps them for the session.

A saved task list can group by activity date, project, or cycle, and can set
a second axis. A board stays on status, workflow, priority, or assignee.
Activity-date buckets for a saved view use the viewer's time zone. Those
headers use the viewer's calendar labels, the cached project list, the
workspace roster, and the cycles of the view's team (or each joined team when
the view is not on one team). A team view draft keeps that second axis on a
list as well as on a board.

A group page asks for one extra row. That row is not shown. `hasMore` stays
on only while the loaded rows are still short of the group total and the
server still has a following row. A page that lands exactly on the total does
not keep a load-more control.

Header order for priority, assignee, project, cycle, and activity date follows
the same ranks the list already used for those axes. Status, workflow, and
attention keep the server's group order.

## Visibility and project filters

Hiding sub-issues adds `parentTaskId is null`. Hiding triage on My Work adds
`workflowCategory neq triage`. Those predicates are part of the query, so the
group total matches the rows the list is allowed to draw. A client pass still
drops a stale row on an already loaded page and does not rewrite the total.

A project issue list with filters, or with a milestone selected, loads pages
of 50 through the work query. The milestone filter is `projectMilestoneId eq`.
Status, priority, member, the agent assignee, and milestone grouping each use
a server axis: each group keeps its total and loads its own next page. Hiding
completed issues adds `status notIn completed, canceled`. Hiding sub-issues
adds `parentTaskId is null`. Both apply to the filtered list and the filtered
board, so each total matches the rows on screen. Agent grouping draws agent
columns. Milestone grouping stays on the list; a milestone board uses status
columns. An unfiltered project list and board still read the local task store.

A saved project list grouped by status pages each status. The load-more control
sends that status as `groupKey`. A flat cursor on that query is rejected. A
project board always groups by status, including when the saved grouping was
empty. A team-view preview and the new-view title preview send the viewer's
time zone only while the axis is activity date; the saved query does not store
it. The team-view preview loads the next page of a group instead of stopping
after the first page.

The virtual list measures its scroll parent before paint and once more on the
next frame. When neither pass finds one, the rows still render.
