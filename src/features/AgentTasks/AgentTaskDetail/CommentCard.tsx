import { useEditor } from '@lobehub/editor/react';
import { LexicalRenderer } from '@lobehub/editor/renderer';
import { Markdown } from '@lobehub/ui';
import type { TaskDetailActivity } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { MessageCircle, MoreHorizontal, Pencil, Trash } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { useTaskStore } from '@/store/task';
import { isOptimisticActivityId } from '@/store/task/slices/detail/optimisticActivity';

import { styles } from '../shared/style';

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
  const canEdit = activity.commentCapabilities?.canEdit === true;
  const canDelete = activity.commentCapabilities?.canDelete === true;

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
    [t, canEdit, canDelete, handleEdit, handleDelete],
  );

  return (
    <div
      className={`relative flex flex-col gap-2 overflow-hidden rounded-md border px-2 py-3 ${styles.commentCard}`}
      style={{
        borderColor: cssVar.colorBorderSecondary,
        borderRadius: cssVar.borderRadiusLG,
        background: cssVar.colorBgContainer,
      }}
    >
      <div className="flex items-center gap-2">
        {activity.author?.avatar ? (
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
          <div className="text-[12px] text-muted-foreground" title={relTimeTitle}>
            {relTime}
          </div>
        )}
      </div>

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
              <Button disabled={submitting} size="sm" onClick={handleCancel}>
                {t('taskDetail.comment.cancel')}
              </Button>
              <Button loading={submitting} size="sm" variant="default" onClick={handleSave}>
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
            <DropdownMenuTrigger render={<ActionIcon icon={MoreHorizontal} size={'small'} />} />
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
