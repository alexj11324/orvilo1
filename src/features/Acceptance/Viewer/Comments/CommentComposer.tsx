'use client';

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import {
  AttachmentStrip,
  AttachmentUploadButton,
  useFeedbackAttachments,
} from '../Evidence/attachments';

/** Room for a couple of screenshots without turning a remark into an album. */
const MAX_COMMENT_ATTACHMENTS = 4;

interface CommentComposerProps {
  autoFocus?: boolean;
  /** One-line reply box instead of the two-line root box. */
  compact?: boolean;
  /**
   * Floor for the writing area. The delivery-wide box gets a generous one: a
   * two-line field invites a two-word answer, and this is where the round's
   * real objection gets written.
   */
  minHeight?: number;
  onCancel?: () => void;
  /** Resolve when the comment is persisted; the box clears on success. */
  onSubmit: (content: string, attachments: { fileId: string }[]) => Promise<void>;
  placeholder: string;
  submitLabel?: string;
}

/**
 * A plain-text box with a send button and room for screenshots. Comments here
 * are short remarks between two people looking at the same evidence, and the
 * commonest one is "here is what I see instead" — so a picture is a first-class
 * part of the remark rather than something pasted into the prose. ⌘/Ctrl+Enter
 * sends.
 */
const CommentComposer = memo<CommentComposerProps>(
  ({ autoFocus, compact, minHeight, onCancel, onSubmit, placeholder, submitLabel }) => {
    const { t } = useTranslation('verify');
    const [value, setValue] = useState('');
    const [sending, setSending] = useState(false);
    const { attachments, fileIds, handlePaste, remove, uploadFiles, uploading } =
      useFeedbackAttachments(MAX_COMMENT_ATTACHMENTS);
    const trimmed = value.trim();
    // A screenshot on its own is a complete remark.
    const canSend = (trimmed.length > 0 || fileIds.length > 0) && !uploading;

    const submit = async () => {
      if (!canSend || sending) return;
      setSending(true);
      try {
        await onSubmit(
          trimmed,
          fileIds.map((fileId) => ({ fileId })),
        );
        setValue('');
        for (const id of fileIds) remove(id);
      } catch (cause) {
        console.error('[acceptance:comments]', cause);
        toast.error(t('acceptance.comments.createFailed'));
      } finally {
        setSending(false);
      }
    };

    return (
      <div className="flex flex-col gap-2">
        <Textarea
          autoFocus={autoFocus}
          placeholder={placeholder}
          rows={compact ? 1 : 2}
          style={{ maxHeight: '20lh', minHeight: minHeight || undefined }}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <AttachmentStrip
          attachments={attachments}
          disabled={sending}
          uploading={uploading}
          onRemove={remove}
        />
        <div className="flex items-center gap-2 justify-end">
          <AttachmentUploadButton disabled={sending} onFiles={uploadFiles} />
          <div className="flex flex-col flex-1" />
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t('cancel', { ns: 'common' })}
            </Button>
          )}
          <Button
            disabled={!canSend}
            loading={sending}
            size="sm"
            variant="outline"
            onClick={() => void submit()}
          >
            {submitLabel ?? t('acceptance.comments.send')}
          </Button>
        </div>
      </div>
    );
  },
);

CommentComposer.displayName = 'AcceptanceCommentComposer';

export default CommentComposer;
