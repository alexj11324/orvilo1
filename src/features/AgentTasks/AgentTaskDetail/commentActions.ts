import type { TaskDetailActivity } from '@orvilo/types';

export interface CommentActions {
  /** Anyone who can see the comment can link to it. */
  canCopyLink: boolean;
  canDelete: boolean;
  canEdit: boolean;
}

interface CommentPermissions {
  /** Whether the viewer may write to the task at all (read-only viewers never edit). */
  canWrite: boolean;
}

/**
 * Which items the comment menu offers. Edit and Delete belong to the comment's
 * author only (Plane's rule). The server independently enforces this rule;
 * trusted Agent runtimes may mutate only their own Agent-authored comments.
 */
export const getCommentActions = (
  comment: Pick<TaskDetailActivity, 'author'>,
  viewerId: string | null | undefined,
  permissions: CommentPermissions,
): CommentActions => {
  const author = comment.author;
  const isAuthor = !!viewerId && author?.type === 'user' && author.id === viewerId;
  const canManage = isAuthor && permissions.canWrite;

  return { canCopyLink: true, canDelete: canManage, canEdit: canManage };
};

/** DOM id and URL fragment of a comment card. */
export const commentAnchorId = (commentId: string) => `comment-${commentId}`;

export const isCommentAnchorHash = (hash: string, commentId: string) =>
  hash === `#${commentAnchorId(commentId)}`;
