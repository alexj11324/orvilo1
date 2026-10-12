'use client';

import { cn } from 'cn';
import { PencilIcon, X } from 'lucide-react';
import { createElement, memo, useMemo } from 'react';

import Avatar from '@/components/Avatar';
import { Spinner } from '@/components/ui/spinner';
import { Upload } from '@/components/Upload';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { imageToBase64 } from '@/utils/imageToBase64';
import { createUploadImageHandler } from '@/utils/uploadFIle';

// Image-only avatar control (Upload + square-crop + pencil hover overlay).
// Use when an avatar must come from an uploaded image rather than an emoji.
interface AvatarUploadProps {
  /** Show the hover delete badge (i.e. a real avatar is set). */
  allowDelete?: boolean;
  compressSize?: number;
  loading?: boolean;
  onDelete?: () => void;
  onUpload?: (file: File) => void;
  shape?: 'circle' | 'square';
  size?: number;
  title?: string;
  /** Image URL, or a name string for the generated letter-avatar preview. */
  value?: string;
}

const styles = {
  delete:
    'absolute inset-bs-0.5 end-0.5 z-2 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-destructive-subtle text-destructive-text opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-[ease] group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:opacity-100',
  overlay:
    'absolute inset-0 z-1 flex cursor-pointer items-center justify-center [border-radius:inherit] bg-overlay-mask text-overlay-mask-foreground opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-[ease] group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100 motion-reduce:transition-none',
  wrapper: 'group/avatar relative flex-none cursor-pointer',
};

const AvatarUpload = memo<AvatarUploadProps>(
  ({
    value,
    onUpload,
    onDelete,
    allowDelete,
    loading,
    compressSize = 256,
    shape = 'square',
    size = 72,
    title,
  }) => {
    const handleUpload = useMemo(
      () =>
        createUploadImageHandler(async (dataUrl) => {
          const img = new Image();
          img.src = dataUrl;
          await new Promise((resolve, reject) => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', reject);
          });
          const webpBase64 = imageToBase64({ img, size: compressSize });
          const blob = await (await fetch(webpBase64)).blob();
          onUpload?.(new File([blob], 'avatar.webp', { type: 'image/webp' }));
        }),
      [compressSize, onUpload],
    );

    return (
      <Upload beforeUpload={handleUpload} maxCount={1}>
        <div className="relative">
          <div
            className={cn(
              styles.wrapper,
              shape === 'circle' ? 'rounded-full' : 'rounded-(--radius-card)',
            )}
          >
            <Avatar avatar={value} shape={shape} size={size} title={title} />
            <div className={`${styles.overlay} avatar-edit-overlay`}>
              {createElement(PencilIcon, { size: 16 })}
            </div>
            {allowDelete && (
              <div
                {...clickableProps()}
                className={cn(`${styles.delete} avatar-delete-badge`, CLICKABLE_FOCUS_RING)}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete?.();
                }}
              >
                {createElement(X, { size: 16 })}
              </div>
            )}
          </div>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
              <Spinner />
            </div>
          )}
        </div>
      </Upload>
    );
  },
);

AvatarUpload.displayName = 'AvatarUpload';

export default AvatarUpload;
