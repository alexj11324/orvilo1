'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { PencilIcon, X } from 'lucide-react';
import { createElement, memo, useMemo } from 'react';

import Avatar from '@/components/Avatar';
import { Spinner } from '@/components/ui/spinner';
import { Upload } from '@/components/Upload';
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

const styles = createStaticStyles(({ css }) => ({
  delete: css`
    cursor: pointer;

    position: absolute;
    z-index: 2;
    inset-block-start: 2px;
    inset-inline-end: 2px;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 20px;
    height: 20px;
    border: 2px solid ${cssVar.colorBgContainer};
    border-radius: 50%;

    color: ${cssVar.colorTextLightSolid};

    opacity: 0;
    background: ${cssVar.colorError};

    transition: opacity ${cssVar.motionDurationMid} ease;
  `,
  overlay: css`
    cursor: pointer;

    position: absolute;
    z-index: 1;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 8px;

    opacity: 0;
    background: ${cssVar.colorBgMask};

    transition: opacity ${cssVar.motionDurationMid} ease;
  `,
  wrapper: css`
    cursor: pointer;
    position: relative;
    flex: none;
    border-radius: 8px;

    &:hover .avatar-edit-overlay,
    &:hover .avatar-delete-badge {
      opacity: 1;
    }
  `,
}));

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
          <div className={styles.wrapper}>
            <Avatar avatar={value} shape={shape} size={size} title={title} />
            <div className={`${styles.overlay} avatar-edit-overlay`}>
              {createElement(PencilIcon, {
                size: 16,
                style: { color: cssVar.colorTextLightSolid },
              })}
            </div>
            {allowDelete && (
              <div
                className={`${styles.delete} avatar-delete-badge`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete?.();
                }}
              >
                {createElement(X, { size: 12 })}
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
