# Issue comment actions and activity feed

Frontend behavior of comments on the Issue detail page
(`src/features/AgentTasks/AgentTaskDetail/`).

## Who can edit or delete a comment

`getCommentActions(comment, viewerId, { canWrite })` in `commentActions.ts` decides the menu:

- Edit and Delete: only the comment's author (`author.type === 'user'` and `author.id` equals the viewer's user id), and only when the viewer may write.
- Copy link: everyone.

**The server does not enforce authorship.** `task.updateComment` / `task.deleteComment`
(`apps/server/src/routers/lambda/task.ts`) are `taskProcedureWrite` (scope `agent:update`) and the
model (`packages/database/src/models/task.ts`, `updateComment` / `deleteComment`) only filters by
workspace/task ownership, never by `authorUserId`. The menu is therefore a UI guard only; a
server-side author check is tracked separately.

## Copy link and deep link

"Copy link" copies `<issue link>#comment-<comment id>` (`useCommentCopyLink.ts`). Each card has
`id="comment-<id>"`; when the URL hash matches, `CommentCard` scrolls it into view and rings it for
two seconds.

## Not done: "edited" marker

The activity payload for a comment (`apps/server/src/services/task/index.ts`, comment mapping) only
carries `time` = `createdAt`. `task_comments.updatedAt` exists but is not returned, so an
"edited" marker needs the server to add it to `TaskDetailActivity`.

## Activity filter

All / Comments / Updates is a single-choice `ToggleGroup`. The choice is stored per user in
`localStorage` under `orvilo:task-activity-filter:<userId>` (default All; storage errors are
ignored).

## Failed comment submit

`CommentInput` catches a failed `addComment`, shows `taskDetail.commentSendFailed`, and keeps the
draft in the editor. The store already removes the optimistic row.
