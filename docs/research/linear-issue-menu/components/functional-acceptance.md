# Issue menu functional acceptance

Candidate worktree: issue-ui-corrections/orvilo1. Every result must be captured at
its candidate revision. Labels alone do not prove completion. Use throwaway local
clone fixtures; no reference Linear writes. Editor/body/resource/state owners may
still be changing source, so rerun only outcomes affected after source freeze.

1. **Team:** current team checked; choose another writable team. Reload confirms
   task.teamId, same issue identity, correct team lists. Denied/Linear-owned moves
   show error; no success or lost task.
2. **Due date:** Custom, Tomorrow, End of this week, In one week. Each date applies
   as YYYY-MM-DD and survives reload; custom date saves/cancels correctly. Existing
   due date can be removed via Remove. Never arm Agent automation.
3. **Add link:** URL + optional title; submit writes task resource row; body shows
   clickable link after reload; invalid URL errors; Remove deletes only that row.
4. **Add pull request:** authorized PR picker shows real queue title/repo/number/
   status, search/select attaches chosen HTTPS PR URL; survives reload. No GitHub
   comment/review mutation. Connection/load/empty errors remain visible.
5. **Add document:** actual document creation in current scope, pin to task, open
   real editable document page. Save content, return/reload issue, document stays
   attached and accessible. Existing source reference only established New
   document navigation; exact form pixels remain unverified.
6. **Create related:** Issue, Sub-issue, Parent issue, Blocked issue, Blocking issue
   each create a fresh inactive ToDo unassigned issue and correct relation
   direction/parent topology atomically. Reload both sides; no Agent starts.
7. **Mark as:** Parent of, Sub-issue of, Related to, Blocked by, Blocking, Duplicate
   of choose existing readable issue and persist exact relationship. Reject self,
   invalid cycle/private scope/duplicate target. Other relation edits preserve actual execution; duplicate marking follows
   its owning cancellation lifecycle and retains history. No manual fake status
   changes; removing duplicate relation does not automatically reactivate it.
8. **Remove:** show only existing removable parent/subissue/relation/resource/date
   links; choose one and reload both sides, unrelated records preserved.
9. **Copy:** ID, URL, title, title as link, issue Markdown, everything Markdown,
   git branch name (only if real branch binding), prompt. Verify clipboard bytes
   against issue fields and workspace-aware URL; UUID-mounted host copies readable
   identifier. No flat duplicate Copy ID/URL top-level entries.
10. **Convert to:** Project creates real project with requested identifier/name
    and explicitly renamed original issue; project/task links survive reload.
    Template persists named immutable definition, listable/usable via real API.
    Recurring persists first due date, cadence, interval, timezone and actual
    next-issue generation at00:01 following previous due date; fresh ToDo issue,
    no Agent execution. Check disable/remove recurrence where applicable.
11. **Make a copy:** explicit selected properties/subissues copied; fresh identity,
    expected topology and labels/assignees/project/team/date. New issue inactive
    ToDo, no current run/dispatch/grant/automation configuration copied.
12. **Favorite:** star and menu use same canonical UUID; toggle either updates
    other surface/board and favorite list, survives reload; reader may favorite.
13. **Remind me:** one hour, tomorrow, next week, one month, custom future datetime.
    Persist caller's reminder and checked/dated state, clear via removal. Other
    caller's reminder unaffected. Reader can remind self without due-date edits;
    notification sweep delivers once when readable. Past custom values rejected.
14. **Description history:** real captured baseline/edit versions and current
    content, author/date, previous/next selection. Current restore disabled;
    restore older version with CAS updates instruction+editorData, captures new
    revision and survives reload. Concurrent revision rejects visibly. Old
    uncaptured history is not fabricated.
15. **Delete:** preserve the existing selected-issue confirmation and API;
    confirm/cancel, clean up that issue's owned records, then navigate correctly.
    Fresh reload cannot read the deleted issue. Existing sub-issues survive as
    standalone issues with `parentTaskId=null`; no descendant cascade or claim
    about unverified Linear deletion semantics.

Shared checks: breadcrumb/star/ellipsis centers aligned; valid sibling li markup;
all visible enabled clickable controls have visible hover feedback; all forms
show pending/error states; viewer/write/tenant guards; scoped host actions remain
bound when routed and portal details coexist. Source gates/tests and actual
runtime outcome evidence remain separate. CI tsgo only; no local full suite.
