/**
 * What the delete confirmation says about an Issue's sub-issues. Deleting a
 * parent keeps its sub-issues and turns them into top-level Issues, so the
 * dialog states how many are affected instead of a bare "cannot be undone".
 */
export type TaskDeleteConfirmCopy =
  | { key: 'taskDetail.deleteConfirm.content' }
  | { key: 'taskDetail.deleteConfirm.contentUnknownSubIssues' }
  | { count: number; key: 'taskDetail.deleteConfirm.contentWithSubIssues' };

/**
 * @param subIssueCount direct sub-issues of the Issue being deleted;
 * `undefined` when it could not be read, which must not be shown as "none".
 */
export const taskDeleteConfirmCopy = (subIssueCount: number | undefined): TaskDeleteConfirmCopy => {
  if (subIssueCount === undefined)
    return { key: 'taskDetail.deleteConfirm.contentUnknownSubIssues' };
  if (subIssueCount > 0)
    return { count: subIssueCount, key: 'taskDetail.deleteConfirm.contentWithSubIssues' };
  return { key: 'taskDetail.deleteConfirm.content' };
};
