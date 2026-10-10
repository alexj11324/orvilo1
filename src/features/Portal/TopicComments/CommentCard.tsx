import { Markdown } from '@lobehub/ui';
import type { TopicCommentItem } from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import { MessageCircle, MoreHorizontal, Pencil, Trash } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import type { DropdownItem } from '@/components/ItemsMenu';
import { DropdownMenu } from '@/components/ItemsMenu';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import RichTextMessage from '@/features/Conversation/Messages/User/components/RichTextMessage';
import { useTopicCommentMutations } from '@/features/TopicComment/hooks';
import { useActivityTime } from '@/hooks/useActivityTime';

import AnchorPreview from './AnchorPreview';
import { createTopicCommentUpdateInput, hasTopicCommentEditorData } from './commentContent';
import { styles } from './styles';
import TopicCommentEditor, {
  type TopicCommentEditorRef,
  type TopicCommentEditorValue,
} from './TopicCommentEditor';

interface CommentCardProps {
  comment: TopicCommentItem;
  onDeleted?: (mode: 'hard' | 'moderated' | 'soft') => void;
  onMutated?: () => void;
  onOpenThread?: () => void;
  pending?: boolean;
  replyCount?: number;
  replyStyle?: boolean;
  rootReplyCount?: number;
}

const CommentContent = memo<Pick<TopicCommentItem, 'content' | 'editorData'>>(
  ({ content, editorData }) => {
    return hasTopicCommentEditorData(editorData) ? (
      <RichTextMessage editorState={editorData} />
    ) : (
      <Markdown fontSize={14} variant={'chat'}>
        {content}
      </Markdown>
    );
  },
);

CommentContent.displayName = 'TopicCommentContent';

const CommentCard = memo<CommentCardProps>(
  ({
    comment,
    onDeleted,
    onMutated,
    onOpenThread,
    pending,
    replyCount,
    replyStyle,
    rootReplyCount,
  }) => {
    const { t } = useTranslation('chat');

    const { text: time, title: timeTitle } = useActivityTime(comment.createdAt);
    const { mutatingIds, remove, restore, update } = useTopicCommentMutations();
    const [editing, setEditing] = useState(false);
    const [nextContent, setNextContent] = useState(comment.content);
    const [nextEditorData, setNextEditorData] = useState(comment.editorData);
    const editorRef = useRef<TopicCommentEditorRef>(null);
    const mutating = mutatingIds.has(comment.id);
    const deleted = Boolean(comment.deletedAt);
    const moderated = Boolean(comment.moderatedAt);
    const authorName =
      comment.author.fullName || comment.author.username || t('topicComment.author.deactivated');
    const edited = new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime();

    const handleUpdate = useCallback(async () => {
      const editorValue: TopicCommentEditorValue = editorRef.current?.getValue() ?? {
        content: nextContent,
        editorData: nextEditorData ?? null,
      };
      const input = createTopicCommentUpdateInput(comment.id, editorValue);
      if (!input.content || mutating) return;
      setNextContent(editorValue.content);
      setNextEditorData(editorValue.editorData);
      try {
        setEditing(false);
        await update(input, comment);
        onMutated?.();
      } catch {
        setEditing(true);
        toast.error(t('topicComment.updateFailed'));
      }
    }, [comment, mutating, nextContent, nextEditorData, onMutated, t, update]);

    const handleDelete = useCallback(() => {
      confirmModal({
        content: t('topicComment.deleteConfirm.content'),
        okButtonProps: { danger: true },
        okText: t('topicComment.delete'),
        onOk: () => {
          void remove(comment, replyCount ? 'soft' : 'hard', { rootReplyCount })
            .then((result) => {
              onDeleted?.(result.mode);
              onMutated?.();
            })
            .catch(() => {
              toast.error(t('topicComment.deleteFailed'));
            });
        },
        title: t('topicComment.deleteConfirm.title'),
      });
    }, [comment, onDeleted, onMutated, remove, replyCount, rootReplyCount, t]);

    const handleRestore = useCallback(async () => {
      try {
        await restore(comment, { rootReplyCount: replyCount });
        onMutated?.();
      } catch {
        toast.error(t('topicComment.restoreFailed'));
      }
    }, [comment, onMutated, replyCount, restore, t]);

    const menuItems = useMemo<DropdownItem[]>(() => {
      const items: DropdownItem[] = [];
      if (comment.canEdit) {
        items.push({
          icon: (
            <span className="anticon" role="img">
              <Pencil fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          ),
          key: 'edit',
          label: t('topicComment.edit'),
          onClick: () => {
            setNextContent(comment.content);
            setNextEditorData(comment.editorData);
            setEditing(true);
          },
        });
      }
      if (comment.canDelete) {
        items.push({
          danger: true,
          icon: (
            <span className="anticon" role="img">
              <Trash fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          ),
          key: 'delete',
          label: t('topicComment.delete'),
          onClick: handleDelete,
        });
      }
      return items;
    }, [comment.canDelete, comment.canEdit, comment.content, comment.editorData, handleDelete, t]);

    return (
      <div
        className={cn('flex flex-col gap-2', `${styles.card} ${replyStyle ? styles.reply : ''}`)}
        data-topic-comment-id={comment.id}
      >
        <div className="flex flex-row items-center gap-2">
          <Avatar avatar={comment.author.avatar || authorName} size={24} />
          <div className="text-[13px] font-medium">{authorName}</div>
          {comment.author.status === 'former' && (
            <div className="text-[12px] text-muted-foreground">
              {t('topicComment.author.former')}
            </div>
          )}
          {pending ? (
            <div className="text-[12px] text-muted-foreground">{t('topicComment.sending')}</div>
          ) : (
            time && (
              <div className="text-[12px] text-muted-foreground" title={timeTitle}>
                {time}
              </div>
            )
          )}
          {edited && !deleted && (
            <div className={cn('text-[12px]', styles.edited)}>{t('topicComment.edited')}</div>
          )}
        </div>

        <AnchorPreview comment={comment} />

        {deleted ? (
          <div className={cn(styles.deleted)}>{t('topicComment.deleted')}</div>
        ) : moderated ? (
          <div className="flex flex-col gap-2">
            <div className={cn(styles.deleted)}>
              {comment.moderationIsOwn
                ? t('topicComment.removedOwn')
                : comment.canRestore
                  ? t('topicComment.removedOwnerView')
                  : t('topicComment.removed')}
            </div>
            {comment.canRestore && comment.content && (
              <div className={styles.moderatedContent}>
                <CommentContent content={comment.content} editorData={comment.editorData} />
              </div>
            )}
            {comment.canRestore && comment.moderationExpiresAt && (
              <div className="flex flex-row items-center gap-2 justify-between">
                <div className="text-[12px] text-muted-foreground">
                  {t('topicComment.restoreDeadline', {
                    date: formatAbsoluteDateTime(comment.moderationExpiresAt),
                  })}
                </div>
                <Button loading={mutating} size="sm" variant="outline" onClick={handleRestore}>
                  {t('topicComment.restore')}
                </Button>
              </div>
            )}
          </div>
        ) : editing ? (
          <div className="flex flex-col gap-2">
            <div className={styles.editEditor}>
              <TopicCommentEditor
                autoFocus
                disabled={mutating}
                initialContent={nextContent}
                initialEditorData={nextEditorData}
                placeholder={t('topicComment.placeholder')}
                ref={editorRef}
                onChange={({ content, editorData }) => {
                  setNextContent(content);
                  setNextEditorData(editorData);
                }}
              />
            </div>
            <div className="flex flex-row gap-2 justify-end">
              <Button
                disabled={mutating}
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                {t('topicComment.cancel')}
              </Button>
              <Button loading={mutating} size="sm" variant="default" onClick={handleUpdate}>
                {t('topicComment.save')}
              </Button>
            </div>
          </div>
        ) : (
          <CommentContent content={comment.content} editorData={comment.editorData} />
        )}

        {onOpenThread && (
          <div className="flex flex-row justify-end">
            <Button size="sm" variant="ghost" onClick={onOpenThread}>
              <span className="anticon" role="img">
                <MessageCircle fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
              </span>
              {replyCount
                ? t('topicComment.replies', { count: replyCount })
                : t('topicComment.reply')}
            </Button>
          </div>
        )}

        {!editing && menuItems.length > 0 && (
          <div className={`${styles.cardActions} topic-comment-actions`}>
            <DropdownMenu items={menuItems}>
              <ActionIcon
                aria-label={t('more', { ns: 'common' })}
                icon={MoreHorizontal}
                loading={mutating}
                size={'small'}
              />
            </DropdownMenu>
          </div>
        )}
      </div>
    );
  },
);

CommentCard.displayName = 'TopicCommentCard';

export default CommentCard;
