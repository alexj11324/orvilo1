'use client';

import type { AcceptanceAttachment } from '@orvilo/types';
import { cn } from 'cn';
import { ImagePlus, X } from 'lucide-react';
import { type ClipboardEvent, memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Image } from '@/components/ImagePreview';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Upload } from '@/components/Upload';
import { useFileStore } from '@/store/file';

/** 10MB — a screenshot, not a video; keeps the reject payload light. */
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const styles = {
  flushUpload: 'contents',
  remove:
    'absolute inset-bs-0 end-0 z-2 rounded-full border-0 bg-destructive p-0 text-destructive-on-fill opacity-100 hover:bg-destructive hover:text-destructive-on-fill',
  thumb: 'relative h-14 w-14 overflow-hidden rounded-(--radius-card) border border-divider',
  thumbLarge: 'h-auto w-auto max-h-55 max-w-[min(100%,360px)]',
  thumbLoading: 'flex items-center justify-center bg-fill-quaternary text-foreground-tertiary',
} as const;

/** An attachment the user just uploaded this session — id + a live preview URL. */
export interface PendingAttachment {
  id: string;
  name?: string;
  url: string;
}

const pickImages = (files: File[]): File[] =>
  files.filter((file) => file.type.startsWith('image/'));

/**
 * Draft-attachment state for a feedback compose surface: click-to-upload and
 * paste both funnel through {@link useFileStore}'s `uploadWithProgress`, so an
 * attachment is a real file row the reject/group-feedback write references by
 * id (the same flywheel evidence uses), never a base64 blob on the note.
 */
export const useFeedbackAttachments = (max = 6, initialAttachments: PendingAttachment[] = []) => {
  const { t } = useTranslation('verify');

  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const [attachments, setAttachments] = useState<PendingAttachment[]>(initialAttachments);
  const [uploadingCount, setUploadingCount] = useState(0);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = pickImages(files);
      if (images.length === 0) return;

      const room = max - attachments.length;
      if (room <= 0) {
        toast.info(t('acceptance.review.attachLimit', { count: max }));
        return;
      }

      await Promise.all(
        images.slice(0, room).map(async (file) => {
          if (file.size > MAX_ATTACHMENT_SIZE) {
            toast.error(t('acceptance.review.attachTooLarge'));
            return;
          }
          setUploadingCount((count) => count + 1);
          try {
            const result = await uploadWithProgress({ file });
            if (result?.id && result.url) {
              setAttachments((previous) => [
                ...previous,
                { id: result.id, name: file.name, url: result.url },
              ]);
            }
          } catch (error) {
            console.error('[acceptance] attachment upload failed', error);
            toast.error(t('acceptance.review.attachFailed'));
          } finally {
            setUploadingCount((count) => count - 1);
          }
        }),
      );
    },
    [attachments.length, max, t, uploadWithProgress],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const files = [...event.clipboardData.items]
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length === 0) return;
      // A pasted screenshot must not also land as text in the note.
      event.preventDefault();
      void uploadFiles(files);
    },
    [uploadFiles],
  );

  const remove = useCallback(
    (id: string) => setAttachments((previous) => previous.filter((item) => item.id !== id)),
    [],
  );

  return {
    attachments,
    fileIds: attachments.map((item) => item.id),
    handlePaste,
    remove,
    uploadFiles,
    uploading: uploadingCount > 0,
  };
};

interface AttachmentStripProps {
  attachments: PendingAttachment[];
  disabled?: boolean;
  onRemove: (id: string) => void;
  uploading?: boolean;
}

/** The draft thumbnails in a compose surface — each removable, plus a spinner tile while uploading. */
export const AttachmentStrip = memo<AttachmentStripProps>(
  ({ attachments, disabled, onRemove, uploading }) => {
    const { t } = useTranslation('verify');
    if (attachments.length === 0 && !uploading) return null;
    return (
      <div className="flex gap-2 flex-wrap">
        {attachments.map((attachment) => (
          <div className={styles.thumb} key={attachment.id}>
            <Image
              alt={attachment.name ?? ''}
              height="100%"
              objectFit="cover"
              preview={false}
              src={attachment.url}
              style={{ borderRadius: 0, height: '100%', width: '100%' }}
              styles={{ image: { display: 'block' }, wrapper: { height: '100%', width: '100%' } }}
              variant="borderless"
              width="100%"
            />
            {!disabled && (
              <Button
                aria-label={t('acceptance.review.removeAttachment')}
                className={cn('acceptance-attach-remove', styles.remove)}
                size="icon"
                type={'button'}
                variant="ghost"
                onClick={() => onRemove(attachment.id)}
              >
                <X className="size-4" size={16} />
              </Button>
            )}
          </div>
        ))}
        {uploading && (
          <div className={cn(styles.thumb, styles.thumbLoading)}>
            <Spinner />
          </div>
        )}
      </div>
    );
  },
);

AttachmentStrip.displayName = 'AcceptanceAttachmentStrip';

interface AttachmentUploadButtonProps {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

/** The "attach screenshot" trigger — a picker button that hands files back for upload. */
export const AttachmentUploadButton = memo<AttachmentUploadButtonProps>(({ disabled, onFiles }) => {
  const { t } = useTranslation('verify');
  return (
    <Upload
      multiple
      accept={'image/*'}
      className={styles.flushUpload}
      disabled={disabled}
      style={{ display: 'contents' }}
      beforeUpload={(file, fileList) => {
        // beforeUpload fires per file — fire the batch once, on the first item.
        if (file === fileList[0]) onFiles(fileList as unknown as File[]);
        return false;
      }}
    >
      <Button
        className="self-start text-sm leading-5.5"
        disabled={disabled}
        size="lg"
        variant="ghost"
      >
        <ImagePlus />
        {t('acceptance.review.attach')}
      </Button>
    </Upload>
  );
});

AttachmentUploadButton.displayName = 'AcceptanceAttachmentUploadButton';

interface AttachmentThumbsProps {
  attachments?: AcceptanceAttachment[];
  /** `comment` shows the picture at reading size; the default is the 56px chip. */
  size?: 'chip' | 'comment';
}

/** Read-only screenshots on a settled feedback card — click any to zoom (native preview). */
export const AttachmentThumbs = memo<AttachmentThumbsProps>(({ attachments, size = 'chip' }) => {
  const usable = (attachments ?? []).filter((attachment) => attachment.url);
  if (usable.length === 0) return null;
  return (
    // Every host row is itself clickable (jump to the check), and that jump closes the
    // drawer this list often lives in — which would unmount the zoom viewer in the same
    // tick it opened. Zooming a thumbnail is its own action, so it stops here.
    <div
      className="flex gap-1.5 flex-wrap"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {usable.map((attachment) => (
        <div
          className={cn(styles.thumb, size === 'comment' && styles.thumbLarge)}
          key={attachment.id}
        >
          <Image
            alt={attachment.name ?? ''}
            height={size === 'comment' ? 'auto' : '100%'}
            maxHeight={size === 'comment' ? 220 : '100%'}
            maxWidth={size === 'comment' ? 'min(100%, 360px)' : '100%'}
            objectFit={size === 'comment' ? 'contain' : 'cover'}
            src={attachment.url!}
            variant="borderless"
            width={size === 'comment' ? 'auto' : '100%'}
            style={{
              borderRadius: 0,
              height: size === 'comment' ? 'auto' : '100%',
              width: size === 'comment' ? 'auto' : '100%',
            }}
            styles={{
              image: { display: 'block' },
              wrapper: {
                height: size === 'comment' ? 'auto' : '100%',
                width: size === 'comment' ? 'auto' : '100%',
              },
            }}
          />
        </div>
      ))}
    </div>
  );
});

AttachmentThumbs.displayName = 'AcceptanceAttachmentThumbs';
