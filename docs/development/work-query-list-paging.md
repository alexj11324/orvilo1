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

Work-query lists render through a virtual list. Group headers are items in
that list, so collapsing a group removes its rows from the window. My Work
stores collapsed groups with the display options. Team issues store them in
the `groups` URL parameter. A saved view keeps them for the session.

Header order for priority, assignee, project, cycle, and activity date follows
the same ranks the list already used for those axes. Status, workflow, and
attention keep the server's group order.

## Visibility and project filters

Hiding sub-issues adds `parentTaskId is null`. Hiding triage on My Work adds
`workflowCategory neq triage`. Those predicates are part of the query, so the
group total matches the rows the list is allowed to draw. A client pass still
drops a stale row on an already loaded page and does not rewrite the total.

A project issue list with filters, or with a milestone selected, loads pages
of 50 through the work query. The milestone is `projectMilestoneId eq`. The
same query feeds the project board. An unfiltered project list and board still
read the local task store.
