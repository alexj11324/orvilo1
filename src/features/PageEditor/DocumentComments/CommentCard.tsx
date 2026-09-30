import { ChatInput, ChatInputActionBar, useEditor } from '@lobehub/editor/react';
import { Markdown } from '@lobehub/ui';
import type { DocumentCommentItem } from '@orvilo/types';
import { cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronRight, MessageCircle, Pencil, Trash } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { AttachmentMenu } from '@/features/AttachmentInput';
import RichTextMessage from '@/features/Conversation/Messages/User/components/RichTextMessage';
import { TypoBar } from '@/features/EditorCanvas';
import {
  getEditorAttachmentStateFromJson,
  insertExistingAttachmentsIntoEditor,
  insertFilesIntoEditor,
} from '@/features/EditorCanvas/editorAttachments';
import { useActivityTime } from '@/hooks/useActivityTime';
import { useEnterToSend } from '@/hooks/useEnterToSend';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { documentCommentService } from '@/services/documentComment';

import DocumentCommentEditor, {
  type DocumentCommentEditorRef,
  type DocumentCommentEditorValue,
} from './DocumentCommentEditor';
import type { DocumentCommentUpdateHandler } from './optimistic';
import { isOptimisticDocumentComment } from './optimistic';
import { COMMENT_INPUT_MAX_HEIGHT, styles } from './styles';

interface CommentCardProps {
  comment: DocumentCommentItem;
  /** Set when a deep link targets this comment; each new token scrolls + highlights again. */
  focusToken?: number;
  onMutated: () => void | Promise<void>;
  onReply?: () => void;
  onUpdate: DocumentCommentUpdateHandler;
  replying?: boolean;
  variant?: 'reply' | 'root';
}

const hasDocumentCommentEditorData = (editorData: DocumentCommentItem['editorData']) =>
  Boolean(
    editorData &&
    typeof editorData === 'object' &&
    !Array.isArray(editorData) &&
    Object.keys(editorData).length > 0,
  );

const CommentContent = memo<Pick<DocumentCommentItem, 'content' | 'editorData'>>(
  ({ content, editorData }) => (
    <div className={styles.commentContent}>
      {hasDocumentCommentEditorData(editorData) ? (
        <RichTextMessage editorState={editorData} variant={'default'} />
      ) : (
        <Markdown fontSize={16} variant={'chat'}>
          {content}
        </Markdown>
      )}
    </div>
  ),
);

CommentContent.displayName = 'DocumentCommentContent';

const CommentCard = memo<CommentCardProps>(
  ({ comment, focusToken, onMutated, onReply, onUpdate, replying, variant = 'root' }) => {
    const { t } = useTranslation('file');
    const cardRef = useRef<HTMLDivElement>(null);
    const { text: time, title: timeTitle } = useActivityTime(comment.createdAt);
    const shouldSendOnEnter = useEnterToSend();
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState(comment.content);
    const [editorData, setEditorData] = useState(comment.editorData);
    const editEditor = useEditor();
    const editorRef = useRef<DocumentCommentEditorRef>(null);
    const editInputRef = useRef<HTMLDivElement>(null);
    const [showTypoBar, setShowTypoBar] = useLocalStorageState(
      'document-comment:show-formatting-toolbar',
      false,
    );
    const [mutating, setMutating] = useState(false);
    const deleted = Boolean(comment.deletedAt);
    const optimistic = isOptimisticDocumentComment(comment);
    const authorName =
      comment.author.fullName ||
      comment.author.username ||
      t('pageEditor.comments.author.deactivated');
    const replyToName =
      comment.replyTo?.author.fullName ||
      comment.replyTo?.author.username ||
      (comment.replyTo ? t('pageEditor.comments.author.deactivated') : null);
    const edited = new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime();

    useEffect(() => {
      const node = cardRef.current;
      if (focusToken === undefined || !node) return;
      // Honor reduced motion: jump instead of gliding; the steady highlight itself stays.
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      node.classList.add(styles.highlighted);
      const timer = setTimeout(() => node.classList.remove(styles.highlighted), 2400);
      return () => {
        clearTimeout(timer);
        node.classList.remove(styles.highlighted);
      };
    }, [focusToken]);

    const handleUpdate = useCallback(async () => {
      const editorValue: DocumentCommentEditorValue = editorRef.current?.getValue() ?? {
        content,
        editorData,
      };
      const nextContent = editorValue.content.trim();
      const attachmentState = getEditorAttachmentStateFromJson(editorValue.editorData);
      if (
        attachmentState.hasIncompleteAttachments ||
        (!nextContent && !attachmentState.hasCompletedAttachments) ||
        mutating
      )
        return;
      setContent(nextContent);
      setEditorData(editorValue.editorData);
      setMutating(true);
      setEditing(false);
      try {
        await onUpdate(comment, { content: nextContent, editorData: editorValue.editorData });
      } catch {
        setEditing(true);
        toast.error(t('pageEditor.comments.updateFailed'));
      } finally {
        setMutating(false);
      }
    }, [comment, content, editorData, mutating, onUpdate, t]);

    const handleDelete = useCallback(() => {
      confirmModal({
        content: t('pageEditor.comments.deleteConfirm.content'),
        okButtonProps: { danger: true },
        okText: t('pageEditor.comments.delete'),
        onOk: async () => {
          setMutating(true);
          try {
            await documentCommentService.delete(comment.id);
            await onMutated();
          } catch {
            toast.error(t('pageEditor.comments.deleteFailed'));
            throw new Error('Failed to delete document comment');
          } finally {
            setMutating(false);
          }
        },
        title: t('pageEditor.comments.deleteConfirm.title'),
      });
    }, [comment.id, onMutated, t]);

    const handleEdit = useCallback(() => {
      setContent(comment.content);
      setEditorData(comment.editorData);
      setEditing(true);
    }, [comment.content, comment.editorData]);

    const handleAttach = useCallback(
      (files: File[]) => {
        insertFilesIntoEditor(editEditor, files);
      },
      [editEditor],
    );
    const attachmentState = getEditorAttachmentStateFromJson(editorData);

    return (
      <div
        data-document-comment-id={comment.id}
        ref={cardRef}
        className={cx(
          'flex flex-col',
          `${styles.card} ${variant === 'reply' ? styles.replyCard : ''}`,
        )}
      >
        <div className={cx('flex flex-row items-center gap-2', styles.header)}>
          <Avatar
            avatar={comment.author.avatar || authorName}
            size={variant === 'reply' ? 28 : 32}
          />
          <div className="text-[14px] font-semibold">{authorName}</div>
          {replyToName && (
            <>
              <ChevronRight aria-hidden className={styles.replyTargetIcon} size={14} />
              <div className="text-[14px] font-semibold">{replyToName}</div>
            </>
          )}
          {comment.author.status === 'former' && (
            <div className={cn('text-[12px]', styles.meta)}>
              {t('pageEditor.comments.author.former')}
            </div>
          )}
          {time && (
            <div className={cn('text-[14px]', styles.meta)} title={timeTitle}>
              {time}
            </div>
          )}
          {edited && !deleted && (
            <div className={cn('text-[12px]', styles.meta)}>{t('pageEditor.comments.edited')}</div>
          )}
        </div>

        <div className={`${styles.body} ${variant === 'reply' ? styles.replyBody : ''}`}>
          {deleted ? (
            <div className={cn(styles.deleted)}>{t('pageEditor.comments.deleted')}</div>
          ) : editing ? (
            <ChatInput
              className={styles.editComposer}
              header={showTypoBar ? <TypoBar editor={editEditor} /> : undefined}
              maxHeight={COMMENT_INPUT_MAX_HEIGHT}
              minHeight={64}
              resize={false}
              slashMenuRef={editInputRef}
              footer={
                <ChatInputActionBar
                  style={{ paddingBlock: 4, paddingInline: 8 }}
                  left={
                    <AttachmentMenu
                      disabled={mutating}
                      formatEnabled={showTypoBar}
                      onFiles={handleAttach}
                      onFormatEnabledChange={setShowTypoBar}
                      onLibraryFiles={(attachments) =>
                        insertExistingAttachmentsIntoEditor(editEditor, attachments)
                      }
                    />
                  }
                  right={
                    <div className="flex flex-row gap-2">
                      <Button
                        disabled={mutating}
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(false)}
                      >
                        {t('pageEditor.comments.cancel')}
                      </Button>
                      <Button
                        loading={mutating}
                        size="sm"
                        variant="default"
                        disabled={
                          attachmentState.hasIncompleteAttachments ||
                          (!content.trim() && !attachmentState.hasCompletedAttachments)
                        }
                        onClick={handleUpdate}
                      >
                        {t('pageEditor.comments.save')}
                      </Button>
                    </div>
                  }
                />
              }
              onBodyClick={() => editEditor.focus()}
            >
              <DocumentCommentEditor
                autoFocus
                compact
                disabled={mutating}
                editor={editEditor}
                entityId={comment.id}
                getPopupContainer={() => editInputRef.current}
                initialContent={content}
                initialEditorData={editorData}
                placeholder={t('pageEditor.comments.placeholder')}
                ref={editorRef}
                onChange={({ content: nextContent, editorData: nextEditorData }) => {
                  setContent(nextContent);
                  setEditorData(nextEditorData);
                }}
                onPressEnter={(event) => {
                  // Same interaction as the composer: Enter saves (per the
                  // global send preference), Shift+Enter inserts a newline.
                  if (!shouldSendOnEnter(event)) return;
                  void handleUpdate();
                  return true;
                }}
              />
            </ChatInput>
          ) : (
            <CommentContent content={comment.content} editorData={comment.editorData} />
          )}
        </div>

        {!optimistic && !editing && (onReply || comment.canEdit || comment.canDelete) && (
          <div
            className={cx(
              'flex flex-row gap-1',
              `${styles.actions} ${variant === 'reply' ? styles.replyCardActions : ''}`,
            )}
          >
            {onReply && (
              <ActionIcon
                aria-label={t('pageEditor.comments.replyAction')}
                aria-pressed={replying}
                disabled={mutating}
                icon={MessageCircle}
                size={'small'}
                title={t('pageEditor.comments.replyAction')}
                onClick={onReply}
              />
            )}
            {comment.canEdit && (
              <ActionIcon
                aria-label={t('pageEditor.comments.edit')}
                disabled={mutating}
                icon={Pencil}
                size={'small'}
                title={t('pageEditor.comments.edit')}
                onClick={handleEdit}
              />
            )}
            {comment.canDelete && (
              <ActionIcon
                aria-label={t('pageEditor.comments.delete')}
                icon={Trash}
                loading={mutating}
                size={'small'}
                title={t('pageEditor.comments.delete')}
                onClick={handleDelete}
              />
            )}
          </div>
        )}
      </div>
    );
  },
);

CommentCard.displayName = 'DocumentCommentCard';

export default CommentCard;
