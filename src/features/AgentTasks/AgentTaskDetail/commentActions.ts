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
 * author only (Plane's rule). The server does not enforce this — it lets any
 * writer change any comment — so the menu is the only guard; do not widen it
 * (e.g. to agents' comments) without a matching server rule.
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
