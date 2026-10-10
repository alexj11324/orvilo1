'use client';

import type { AcceptanceCommentThread } from '@orvilo/types';
import { cn } from 'cn';
import { CheckCircle2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';

import CommentCard, { commentAuthorName } from './CommentCard';
import CommentComposer from './CommentComposer';
import { styles } from './styles';

interface CommentThreadProps {
  canComment: boolean;
  /**
   * Whether closing THIS thread is the caller's to make. Replying is open to
   * every reader; declaring a concern handled belongs to whoever raised it and
   * to the delivery's reviewers.
   */
  canResolve: boolean;
  onDelete: (id: string) => Promise<void>;
  onReply: (rootId: string, content: string, attachments: { fileId: string }[]) => Promise<void>;
  onResolve: (rootId: string, resolved: boolean) => Promise<void>;
  thread: AcceptanceCommentThread;
}

/**
 * A region note and its answers, as the floating pin shows them: the remark,
 * whoever replied, and the two things you can do about it. Frameless on
 * purpose — the panel it lives in is already a surface.
 *
 * Once it is settled it folds to a single muted line. A handled concern is
 * closed business: it should be findable, not loud, which is why nothing here
 * carries a success colour any more.
 */
const CommentThread = memo<CommentThreadProps>(
  ({ canComment, canResolve, onDelete, onReply, onResolve, thread }) => {
    const { t } = useTranslation('verify');
    const [replying, setReplying] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [openOverride, setOpenOverride] = useState<boolean>();
    const { root, replies } = thread;
    const resolved = Boolean(root.resolvedAt);
    // Reopening a note should show it again without the reader asking twice,
    // so the override only holds while the resolved state stays put.
    const open = openOverride ?? !resolved;

    const toggleResolved = async () => {
      setResolving(true);
      try {
        await onResolve(root.id, !resolved);
        setOpenOverride(undefined);
      } catch (cause) {
        console.error('[acceptance:comments]', cause);
        toast.error(t('acceptance.comments.updateFailed'));
      } finally {
        setResolving(false);
      }
    };

    if (!open)
      return (
        <button
          className={styles.resolvedSummary}
          type={'button'}
          onClick={() => setOpenOverride(true)}
        >
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            <span>
              {t('acceptance.comments.resolvedSummary', {
                count: replies.length + 1,
                name: commentAuthorName(root.author),
              })}
            </span>
          </div>
        </button>
      );

    const badges = root.contextRoundIndex !== null && (
      <Badge size="sm" variant="secondary">
        {t('acceptance.comments.roundContext', { round: root.contextRoundIndex })}
      </Badge>
    );

    return (
      <div className={`flex flex-col ${cn(resolved && styles.resolvedThread)}`}>
        <CommentCard badges={badges} comment={root} variant={'plain'} onDelete={onDelete} />
        {replies.map((reply) => (
          <div className={styles.panelReply} key={reply.id}>
            <CommentCard comment={reply} variant={'plain'} onDelete={onDelete} />
          </div>
        ))}
        {canComment &&
          (replying ? (
            <div className={`flex flex-col ${styles.panelActions}`}>
              <CommentComposer
                autoFocus
                compact
                placeholder={t('acceptance.comments.replyPlaceholder')}
                submitLabel={t('acceptance.comments.reply')}
                onCancel={() => setReplying(false)}
                onSubmit={async (content, attachments) => {
                  await onReply(root.id, content, attachments);
                  setReplying(false);
                }}
              />
            </div>
          ) : (
            <div className={`flex gap-0.5 ${styles.panelActions}`}>
              <Button
                className="-mx-2.5"
                size="sm"
                variant="ghost"
                onClick={() => setReplying(true)}
              >
                {t('acceptance.comments.reply')}
              </Button>
              {canResolve && (
                <Button
                  className="-mx-2.5"
                  loading={resolving}
                  size="sm"
                  variant="ghost"
                  onClick={() => void toggleResolved()}
                >
                  {resolved ? t('acceptance.comments.reopen') : t('acceptance.comments.resolve')}
                </Button>
              )}
              {resolved && (
                <Button
                  className="-mx-2.5"
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenOverride(false)}
                >
                  {t('acceptance.comments.collapseThread')}
                </Button>
              )}
            </div>
          ))}
      </div>
    );
  },
);

CommentThread.displayName = 'AcceptanceCommentThread';

export default CommentThread;
