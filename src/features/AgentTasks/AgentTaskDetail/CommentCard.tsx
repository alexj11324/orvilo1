import { useEditor } from '@lobehub/editor/react';
import { LexicalRenderer } from '@lobehub/editor/renderer';
import { Markdown } from '@lobehub/ui';
import type { TaskDetailActivity } from '@orvilo/types';
import { CornerDownRight, Link2, MessageCircle, MoreHorizontal, Pencil, Trash } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { confirmModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AttachmentUploadButton } from '@/features/AttachmentInput';
import { mentionFilledClassName } from '@/features/ChatInput/InputEditor/mentionStyle';
import { EditorCanvas } from '@/features/EditorCanvas';
import { seedAttachments } from '@/features/EditorCanvas/attachmentRegistry';
import {
  getAttachmentFileIdsFromEditor,
  insertFilesIntoEditor,
} from '@/features/EditorCanvas/editorAttachments';
import { LinearFileCard } from '@/features/EditorCanvas/LinearFilePlugin';
import { useWorkspaceCommentMentionOption } from '@/features/Portal/TopicComments/useWorkspaceCommentMentionOption';
import { useActivityTime } from '@/hooks/useActivityTime';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { isOptimisticActivityId } from '@/store/task/slices/detail/optimisticActivity';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import AssigneeAvatar from '../features/AssigneeAvatar';
import { styles } from '../shared/style';
import { commentAnchorId, getCommentActions, isCommentEdited, runAnchorId } from './commentActions';
import { useAnchorHighlight } from './useAnchorHighlight';
import { useCommentCopyLink } from './useCommentCopyLink';

// Keep saved comments visually consistent with the editor: render FileNodes
// as the Linear-style card on its own row instead of the default inline pill.
const FILE_WRAPPER_STYLE = { marginBlock: 8 };
const rendererOverrides = {
  file: (node: Record<string, any>) => (
    <div style={FILE_WRAPPER_STYLE}>
      <LinearFileCard node={node as Parameters<typeof LinearFileCard>[0]['node']} />
    </div>
  ),
};

interface CommentCardProps {
  activity: TaskDetailActivity;
}

const CommentCard = memo<CommentCardProps>(({ activity }) => {
  const { t } = useTranslation('chat');
  const deleteComment = useTaskStore((s) => s.deleteComment);
  const updateComment = useTaskStore((s) => s.updateComment);

  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const editor = useEditor();
  const mentionOption = useWorkspaceCommentMentionOption();

  const { text: relTime, title: relTimeTitle } = useActivityTime(activity.time);
  const content = activity.content || t('taskDetail.activities.fallback.comment');
  const commentId = activity.id;
  const viewerId = useUserStore(userProfileSelectors.userId);
  const { allowed: canWrite } = usePermission('create_content');
  const actions = getCommentActions(activity, viewerId, { canWrite });
  const canEdit = actions.canEdit && activity.commentCapabilities?.canEdit === true;
  const canDelete = actions.canDelete && activity.commentCapabilities?.canDelete === true;
  const copyCommentLink = useCommentCopyLink();

  // `#comment-<id>` deep link: scroll the card into view and ring it briefly.
  const highlighted = useAnchorHighlight(commentId ? commentAnchorId(commentId) : undefined);

  // A comment left on one run names it and links to that run's card.
  const { replyToRun } = activity;
  const navigate = useNavigate();
  const { search } = useLocation();
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);
  const handleOpenRun = useCallback(() => {
    if (!replyToRun) return;
    const anchor = runAnchorId(replyToRun.topicId);
    const card = document.getElementById(anchor);
    // The card is not on screen (filtered out, or in the other panel): open
    // the run itself instead of doing nothing.
    if (!card) return openTopicDrawer(replyToRun.topicId);
    card.scrollIntoView({ block: 'center' });
    void navigate({ hash: `#${anchor}`, search }, { replace: true });
  }, [navigate, openTopicDrawer, replyToRun, search]);

  const edited = isCommentEdited(activity);
  const { title: editedTitle } = useActivityTime(edited ? activity.updatedAt : undefined);

  const editorData = useMemo(
    () => ({
      content: activity.content ?? '',
      editorData: activity.editorData,
    }),
    [activity.content, activity.editorData],
  );

  useEffect(() => {
    if (activity.files && activity.files.length > 0) {
      seedAttachments(
        activity.files.map((f) => ({ downloadUrl: f.downloadUrl, id: f.id, url: f.url })),
      );
    }
  }, [activity.files]);

  const handleEdit = useCallback(() => {
    if (canEdit) setIsEditing(true);
  }, [canEdit]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleAttach = useCallback(
    (files: File[]) => {
      insertFilesIntoEditor(editor, files);
    },
    [editor],
  );

  const handleSave = useCallback(async () => {
    if (!canEdit || !commentId || submitting) return;
    const next = String(editor?.getDocument?.('markdown') ?? '').trim();
    const json = editor?.getDocument?.('json') as unknown;
    const hasFiles = getAttachmentFileIdsFromEditor(editor).length > 0;
    if (!next && !hasFiles) return;
    setSubmitting(true);
    try {
      await updateComment(commentId, next, { editorData: json });
      setIsEditing(false);
    } finally {
      setSubmitting(false);
    }
  }, [canEdit, commentId, editor, submitting, updateComment]);

  const handleDelete = useCallback(() => {
    if (!canDelete || !commentId) return;
    confirmModal({
      content: t('taskDetail.comment.deleteConfirm.content'),
      okButtonProps: { danger: true },
      okText: t('taskDetail.comment.deleteConfirm.ok'),
      onOk: () => deleteComment(commentId),
      title: t('taskDetail.comment.deleteConfirm.title'),
    });
  }, [canDelete, commentId, deleteComment, t]);

  const handleCopyLink = useCallback(() => {
    if (commentId) void copyCommentLink(commentId);
  }, [commentId, copyCommentLink]);

  const menuItems = useMemo(
    () => [
      ...(canEdit
        ? [
            {
              danger: false,
              icon: Pencil,
              key: 'edit',
              label: t('taskDetail.comment.edit'),
              onClick: handleEdit,
            },
          ]
        : []),
      ...(actions.canCopyLink
        ? [
            {
              danger: false,
              icon: Link2,
              key: 'copyLink',
              label: t('taskDetail.comment.copyLink'),
              onClick: handleCopyLink,
            },
          ]
        : []),
      ...(canDelete
        ? [
            {
              danger: true,
              icon: Trash,
              key: 'delete',
              label: t('taskDetail.comment.delete'),
              onClick: handleDelete,
            },
          ]
        : []),
    ],
    [actions.canCopyLink, canDelete, canEdit, t, handleCopyLink, handleEdit, handleDelete],
  );

  return (
    <div
      className={`relative flex flex-col gap-2 overflow-hidden rounded-(--radius-card) border px-2 py-3 transition-[box-shadow] duration-(--orvilo-motion-mid) motion-reduce:transition-none transition-orvilo-task-comment-highlight ${styles.commentCard} ${highlighted ? 'ring-2 ring-ring' : ''}`}
      id={commentId ? commentAnchorId(commentId) : undefined}
      style={{
        borderColor: 'var(--divider)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-center gap-2">
        {activity.author?.type === 'agent' ? (
          <AssigneeAvatar agentId={activity.author.id} size={24} />
        ) : activity.author?.avatar ? (
          <Avatar avatar={activity.author.avatar} size={24} />
        ) : (
          <div className={styles.activityAvatar}>
            <MessageCircle size={12} />
          </div>
        )}
        <div className="font-medium">
          {activity.author?.name || t('taskDetail.activities.fallback.comment')}
        </div>
        {relTime && (
          <div className="text-xs text-muted-foreground" title={relTimeTitle}>
            {relTime}
          </div>
        )}
        {edited && (
          <div
            className="text-xs text-muted-foreground"
            title={t('taskDetail.comment.editedAt', { time: editedTitle })}
          >
            {t('taskDetail.comment.edited')}
          </div>
        )}
      </div>
      {replyToRun &&
        (replyToRun.seq == null ? (
          <div className="text-xs text-muted-foreground">
            {t('taskDetail.comment.replyToRunUnnumbered')}
          </div>
        ) : (
          <Button
            className="self-start text-muted-foreground"
            size="compact"
            variant="ghost"
            onClick={handleOpenRun}
          >
            <CornerDownRight className="size-4" data-icon="inline-start" size={16} />
            {t('taskDetail.comment.replyToRun', { seq: replyToRun.seq })}
          </Button>
        ))}

      {isEditing && (
        <>
          <div className={mentionFilledClassName}>
            <EditorCanvas
              editor={editor}
              editorData={editorData}
              entityId={commentId}
              floatingToolbar={false}
              mentionOption={mentionOption}
              style={{ paddingBottom: 4 }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <AttachmentUploadButton onFiles={handleAttach} />
            <div className="flex gap-2">
              <Button disabled={submitting} size="normal" onClick={handleCancel}>
                {t('taskDetail.comment.cancel')}
              </Button>
              <Button loading={submitting} size="normal" variant="default" onClick={handleSave}>
                {t('taskDetail.comment.save')}
              </Button>
            </div>
          </div>
        </>
      )}
      {!isEditing && Boolean(activity.editorData) && (
        <LexicalRenderer
          className={mentionFilledClassName}
          overrides={rendererOverrides}
          value={activity.editorData as Parameters<typeof LexicalRenderer>[0]['value']}
          variant={'chat'}
        />
      )}
      {!isEditing && !activity.editorData && (
        <Markdown fontSize={14} variant={'chat'}>
          {content}
        </Markdown>
      )}

      {!isEditing && menuItems.length > 0 && commentId && !isOptimisticActivityId(commentId) && (
        <div className={`${styles.commentActions} comment-actions`}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <ActionIcon
                  aria-label={t('more', { ns: 'common' })}
                  icon={MoreHorizontal}
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                />
              }
            />
            <DropdownMenuContent align={'end'} className="min-w-40">
              {menuItems.map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  variant={item.danger ? 'destructive' : 'default'}
                  onClick={item.onClick}
                >
                  <item.icon size={16} />
                  <span className="flex-1">{item.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});

export default CommentCard;
