import { ChatInput, ChatInputActionBar, useEditor } from '@lobehub/editor/react';
import { Markdown } from '@lobehub/ui';
import type { DocumentCommentItem } from '@orvilo/types';
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
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors';

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
        <RichTextMessage
          editorState={editorData}
          fontSize={14}
          lineHeight={22 / 14}
          variant={'default'}
        />
      ) : (
        <Markdown fontSize={14} lineHeight={22 / 14} variant={'chat'}>
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
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const motionDisabled = () =>
        userGeneralSettingsSelectors.animationMode(useUserStore.getState()) === 'disabled' ||
        media.matches;
      const scrollOwners: HTMLElement[] = [];
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent);
        const isViewport = parent === document.scrollingElement;
        if (
          (isViewport || /auto|scroll|hidden/.test(overflow.overflowY)) &&
          parent.scrollHeight > parent.clientHeight
        ) {
          scrollOwners.push(parent);
        } else if (
          /auto|scroll|hidden/.test(overflow.overflowX) &&
          parent.scrollWidth > parent.clientWidth
        ) {
          scrollOwners.push(parent);
        }
      }
      let ownsSmoothScroll = !motionDisabled();
      const stopOwnedScroll = () => {
        if (!ownsSmoothScroll) return;
        ownsSmoothScroll = false;
        for (const parent of scrollOwners) {
          parent.scrollTo({
            behavior: 'instant',
            left: parent.scrollLeft,
            top: parent.scrollTop,
          });
        }
      };
      const stopIfDisabled = () => {
        if (motionDisabled()) stopOwnedScroll();
      };
      const releaseForUserInput = () => {
        ownsSmoothScroll = false;
      };
      const remaining = new Set(scrollOwners);
      const scrollEndHandlers = scrollOwners.map((parent) => {
        const onScrollEnd = () => {
          remaining.delete(parent);
          if (!remaining.size) ownsSmoothScroll = false;
        };
        const onPointerDown = (event: PointerEvent) => {
          // A button click bubbles through its scroller too. Only a direct
          // scroller interaction can release this owner's native operation.
          if (event.target === parent) releaseForUserInput();
        };
        parent.addEventListener('scrollend', onScrollEnd);
        parent.addEventListener('wheel', releaseForUserInput, { passive: true });
        parent.addEventListener('touchmove', releaseForUserInput, { passive: true });
        parent.addEventListener('pointerdown', onPointerDown, { passive: true });
        return { onPointerDown, onScrollEnd, parent };
      });
      const unsubscribe = useUserStore.subscribe(stopIfDisabled);
      media.addEventListener('change', stopIfDisabled);
      // Read again at the actual native operation. The existing highlight dwell
      // is separate from animation and remains visible when motion is disabled.
      node.scrollIntoView({ behavior: motionDisabled() ? 'instant' : 'smooth', block: 'center' });
      node.classList.add(styles.highlighted);
      const timer = setTimeout(() => {
        ownsSmoothScroll = false;
        node.classList.remove(styles.highlighted);
      }, 2400);
      return () => {
        stopOwnedScroll();
        unsubscribe();
        media.removeEventListener('change', stopIfDisabled);
        for (const { onPointerDown, onScrollEnd, parent } of scrollEndHandlers) {
          parent.removeEventListener('scrollend', onScrollEnd);
          parent.removeEventListener('wheel', releaseForUserInput);
          parent.removeEventListener('touchmove', releaseForUserInput);
          parent.removeEventListener('pointerdown', onPointerDown);
        }
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
        className={cn('flex flex-col', styles.card, variant === 'reply' && styles.replyCard)}
        data-document-comment-id={comment.id}
        ref={cardRef}
      >
        <div className={cn('flex flex-row items-center gap-2', styles.header)}>
          <Avatar
            avatar={comment.author.avatar || authorName}
            size={variant === 'reply' ? 28 : 32}
          />
          <div className="text-sm font-semibold">{authorName}</div>
          {replyToName && (
            <>
              <ChevronRight aria-hidden className={styles.replyTargetIcon} size={16} />
              <div className="text-sm font-semibold">{replyToName}</div>
            </>
          )}
          {comment.author.status === 'former' && (
            <div className={cn('text-xs', styles.meta)}>
              {t('pageEditor.comments.author.former')}
            </div>
          )}
          {time && (
            <div className={cn('text-xs leading-5', styles.meta)} title={timeTitle}>
              {time}
            </div>
          )}
          {edited && !deleted && (
            <div className={cn('text-xs', styles.meta)}>{t('pageEditor.comments.edited')}</div>
          )}
        </div>

        <div className={cn(styles.body, variant === 'reply' && styles.replyBody)}>
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
                        size="normal"
                        variant="outline"
                        onClick={() => setEditing(false)}
                      >
                        {t('pageEditor.comments.cancel')}
                      </Button>
                      <Button
                        loading={mutating}
                        size="normal"
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
            className={cn(
              'flex flex-row gap-1',
              styles.actions,
              variant === 'reply' && styles.replyCardActions,
            )}
          >
            {onReply && (
              <ActionIcon
                aria-label={t('pageEditor.comments.replyAction')}
                aria-pressed={replying}
                disabled={mutating}
                icon={MessageCircle}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                title={t('pageEditor.comments.replyAction')}
                onClick={onReply}
              />
            )}
            {comment.canEdit && (
              <ActionIcon
                aria-label={t('pageEditor.comments.edit')}
                disabled={mutating}
                icon={Pencil}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                title={t('pageEditor.comments.edit')}
                onClick={handleEdit}
              />
            )}
            {comment.canDelete && (
              <ActionIcon
                aria-label={t('pageEditor.comments.delete')}
                icon={Trash}
                loading={mutating}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
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
