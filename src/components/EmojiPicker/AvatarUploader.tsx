import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { type CropPosition, cropRectangle } from './crop';
import type { EmojiPickerProps } from './types';

const MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const AvatarUploader = ({
  compressSize = 256,
  shape,
  texts,
  onChange,
  onUpload,
}: Pick<EmojiPickerProps, 'compressSize' | 'shape' | 'texts' | 'onUpload'> & {
  onChange: (value: string) => void;
}) => {
  const { t } = useTranslation(['ui', 'common']);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reader = useRef<FileReader | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; position: CropPosition } | null>(null);
  const [preview, setPreview] = useState('');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState<CropPosition>({ x: 0.5, y: 0.5 });
  const errorText = texts?.fileTypeError ?? t('emojiPicker.fileTypeError');
  const description = texts?.draggerDesc ?? t('emojiPicker.draggerDesc');
  useEffect(() => () => reader.current?.abort(), []);
  useEffect(() => {
    if (!preview) {
      setImage(null);
      return;
    }
    let live = true;
    const next = new Image();
    next.onload = () => {
      if (live) {
        setImage(next);
        setPosition({ x: 0.5, y: 0.5 });
      }
    };
    next.onerror = () => {
      if (live) {
        toast.error(errorText);
        setPreview('');
      }
    };
    next.src = preview;
    return () => {
      live = false;
      next.onload = null;
      next.onerror = null;
    };
  }, [preview, errorText]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!image || !ctx) return;
    const crop = cropRectangle(image.naturalWidth, image.naturalHeight, compressSize, position);
    ctx.clearRect(0, 0, compressSize, compressSize);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, compressSize, compressSize);
  }, [image, position, compressSize]);
  const selectFile = (file?: File) => {
    if (!file) return;
    if (!MIME.has(file.type)) {
      toast.error(errorText);
      return;
    }
    reader.current?.abort();
    const next = new FileReader();
    reader.current = next;
    next.onload = () => {
      if (reader.current === next) setPreview(String(next.result));
    };
    next.onerror = () => toast.error(errorText);
    next.readAsDataURL(file);
  };
  return (
    <div className="flex w-full flex-col items-center gap-2 p-2.5">
      {!preview ? (
        <div
          className="flex w-full flex-col items-center justify-center gap-4 rounded-(--radius-card) border border-dashed border-border p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            selectFile(e.dataTransfer.files[0]);
          }}
        >
          <span className="text-sm text-muted-foreground">{description}</span>
          <Input
            accept="image/jpeg,image/png,image/gif,image/webp"
            aria-label={description}
            type="file"
            onChange={(e) => {
              selectFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </div>
      ) : (
        <>
          <canvas
            aria-label={description}
            className={shape === 'square' ? 'touch-none' : 'touch-none rounded-full'}
            height={compressSize}
            ref={canvas}
            tabIndex={0}
            width={compressSize}
            onKeyDown={(e) => {
              const directions: Record<string, CropPosition> = {
                ArrowLeft: { x: -0.05, y: 0 },
                ArrowRight: { x: 0.05, y: 0 },
                ArrowUp: { x: 0, y: -0.05 },
                ArrowDown: { x: 0, y: 0.05 },
              };
              const delta = directions[e.key];
              if (delta) {
                e.preventDefault();
                setPosition((p) => ({
                  x: Math.max(0, Math.min(1, p.x + delta.x)),
                  y: Math.max(0, Math.min(1, p.y + delta.y)),
                }));
              }
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, position };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (!image || !start || start.id !== e.pointerId) return;
              const crop = cropRectangle(
                image.naturalWidth,
                image.naturalHeight,
                compressSize,
                start.position,
              );
              setPosition({
                x: Math.max(
                  0,
                  Math.min(
                    1,
                    start.position.x -
                      (e.clientX - start.x) / (crop.scale * (image.naturalWidth - crop.width) || 1),
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    1,
                    start.position.y -
                      (e.clientY - start.y) /
                        (crop.scale * (image.naturalHeight - crop.height) || 1),
                  ),
                ),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
          <div className="flex w-full gap-2">
            <Button
              aria-label={t('back', { ns: 'common' })}
              size="icon"
              type="button"
              variant="outline"
              onClick={() => setPreview('')}
            >
              <ChevronLeft />
            </Button>
            <Button
              className="flex-1"
              disabled={!image}
              type="button"
              onClick={() => {
                const output = canvas.current;
                if (!output || !image) return;
                onChange(output.toDataURL());
                if (onUpload)
                  output.toBlob(
                    (blob) => {
                      if (blob) onUpload(new File([blob], 'avatar.webp', { type: 'image/webp' }));
                    },
                    'image/webp',
                    0.95,
                  );
              }}
            >
              {texts?.uploadBtn ?? t('emojiPicker.uploadBtn')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
export default AvatarUploader;
