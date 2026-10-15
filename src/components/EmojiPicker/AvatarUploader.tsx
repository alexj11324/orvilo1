'use client';

import { ChevronLeftIcon, ImageUpIcon } from 'lucide-react';
import { type DragEvent, memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';

import { ACCEPTED_IMAGE_TYPES, cropAvatar, readAsDataURL } from './avatarImage';

interface AvatarUploaderProps {
  compressSize?: number;
  onChange: (avatar: string) => void;
  onUpload?: (file: File) => void;
  shape?: 'circle' | 'square';
}

/** Pick or drop an image, preview its centered square crop, then upload it. */
const AvatarUploader = memo<AvatarUploaderProps>(
  ({ compressSize = 256, onChange, onUpload, shape }) => {
    const { t } = useTranslation('ui');
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState('');
    const [dragging, setDragging] = useState(false);

    const handleFile = async (file?: File) => {
      if (!file) return;
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        toast.error(t('emojiPicker.fileTypeError'));
        return;
      }
      setPreview(await readAsDataURL(file));
    };

    const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setDragging(false);
      void handleFile(event.dataTransfer.files[0]);
    };

    const handleUpload = async () => {
      const { dataUrl, file } = await cropAvatar(preview, compressSize);
      onChange(dataUrl);
      if (file) onUpload?.(file);
    };

    if (preview)
      return (
        <div className="flex w-full flex-col items-center gap-2 p-2.5">
          <img
            alt=""
            className={shape === 'square' ? 'object-cover' : 'rounded-full object-cover'}
            height={compressSize}
            src={preview}
            width={compressSize}
          />
          <div className="flex w-full gap-2">
            <Button
              aria-label={t('common.cancel')}
              size="icon"
              type="button"
              variant="outline"
              onClick={() => setPreview('')}
            >
              <ChevronLeftIcon />
            </Button>
            <Button className="flex-1 font-medium" type="button" onClick={handleUpload}>
              {t('emojiPicker.uploadBtn')}
            </Button>
          </div>
        </div>
      );

    return (
      <div className="w-full p-2.5">
        <button
          className="flex cursor-pointer flex-col items-center justify-center gap-4 rounded-(--radius-card) border border-dashed border-border bg-transparent transition-colors duration-(--orvilo-motion-fast) hover:border-primary data-dragging:border-primary data-dragging:bg-accent motion-reduce:transition-none"
          data-dragging={dragging || undefined}
          style={{ height: compressSize, width: compressSize }}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
        >
          <ImageUpIcon className="text-foreground-description" size={48} />
          <span className="text-sm text-muted-foreground">{t('emojiPicker.draggerDesc')}</span>
          <span className="flex gap-1">
            {['JPG', 'PNG', 'GIF', 'WEBP'].map((type) => (
              <Badge key={type} variant="outline">
                {type}
              </Badge>
            ))}
          </span>
        </button>
        <input
          hidden
          accept={[...ACCEPTED_IMAGE_TYPES].join(',')}
          ref={inputRef}
          type="file"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    );
  },
);
AvatarUploader.displayName = 'AvatarUploader';

export default AvatarUploader;
