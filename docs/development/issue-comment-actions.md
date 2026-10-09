# Issue comment actions and activity feed

Frontend behavior of comments on the Issue detail page
(`src/features/AgentTasks/AgentTaskDetail/`).

## Who can edit or delete a comment

`getCommentActions(comment, viewerId, { canWrite })` in `commentActions.ts` decides the menu:

- Edit and Delete: only the comment's author (`author.type === 'user'` and `author.id` equals the viewer's user id), and only when the viewer may write.
- Copy link: everyone.

**The server does not enforce authorship.** `task.updateComment` / `task.deleteComment`
(`apps/server/src/routers/lambda/task.ts`) are `taskProcedureWrite` (scope `agent:update`) and the
model (`packages/database/src/models/task.ts`, `updateComment` / `deleteComment`) filters by
workspace/task ownership, not by `authorUserId`. This is a pre-existing limitation, and the narrower
menu is an affordance rather than an authorization barrier. The backend's existing contract also
allows authorized human task writers to edit agent notes; this PR does not change that contract.
Changing server authorship policy requires a separate decision covering those agent-note edits.

## Copy link and deep link

"Copy link" copies `<issue link>#comment-<comment id>` (`useCommentCopyLink.ts`). Each card has
`id="comment-<id>"`; when the URL hash matches, `CommentCard` scrolls it into view and rings it for
two seconds.

A valid comment fragment temporarily includes that specific comment even when the user's stored
filter is Updates, and expands a collapsed activity feed. It does not write a new filter preference;
removing the fragment restores ordinary filtering. Unknown fragments do not reveal other comments.

## Not done: "edited" marker

The activity payload for a comment (`apps/server/src/services/task/index.ts`, comment mapping) only
carries `time` = `createdAt`. `task_comments.updatedAt` exists but is not returned, so an
"edited" marker needs the server to add it to `TaskDetailActivity`.

## Activity filter

All / Comments / Updates is a single-choice `ToggleGroup`. The choice is stored per user in
`localStorage` under `orvilo:task-activity-filter:<userId>` (default All; storage errors are
ignored, including browsers that throw when the `localStorage` property itself is accessed).

## Failed comment submit

`CommentInput` catches a failed `addComment`, shows `taskDetail.commentSendFailed`, and keeps the
draft in the editor. The store already removes the optimistic row.
