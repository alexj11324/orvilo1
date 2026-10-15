import type { ComponentProps } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';

import { Image } from '@/components/ImagePreview';
import { useClientDataSWR } from '@/libs/swr';
import { localFileKeys } from '@/libs/swr/keys';
import { type LocalFilePreview, projectFileService } from '@/services/projectFile';

import { resolveMarkdownRelativeAssetPath } from './Body.helpers';

interface MarkdownImageProps extends ComponentProps<'img'> {
  deviceId?: string;
  markdownFilePath: string;
  node?: unknown;
  workingDirectory: string;
}

const MarkdownImage = memo<MarkdownImageProps>(
  ({ alt, className, deviceId, markdownFilePath, node, src, style, workingDirectory }) => {
    void node;

    const markdownSrc = typeof src === 'string' ? src : undefined;
    const resolvedPath = useMemo(
      () => resolveMarkdownRelativeAssetPath({ markdownFilePath, src: markdownSrc }),
      [markdownFilePath, markdownSrc],
    );

    const { data: preview } = useClientDataSWR<LocalFilePreview>(
      resolvedPath
        ? localFileKeys.preview({
            accept: 'image',
            deviceId,
            filePath: resolvedPath,
            workingDirectory,
          })
        : null,
      () =>
        projectFileService.getLocalFilePreview({
          accept: 'image',
          deviceId,
          path: resolvedPath!,
          workingDirectory,
        }),
      { revalidateOnFocus: false },
    );

    const [imageSrc, setImageSrc] = useState<string>();

    useEffect(() => {
      if (!resolvedPath || preview?.type !== 'image') {
        setImageSrc(undefined);
        return;
      }

      const objectUrl = URL.createObjectURL(preview.blob);
      setImageSrc(objectUrl);

      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }, [preview, resolvedPath]);

    if (resolvedPath && !imageSrc) {
      return (
        <span
          aria-label={alt}
          className="inline-block min-h-30 w-80 max-w-full rounded-(--radius-input) bg-fill-quaternary"
          role={alt ? 'img' : undefined}
          title={markdownSrc}
        />
      );
    }

    const resolvedSrc = imageSrc ?? markdownSrc;

    return (
      <Image
        alt={alt}
        classNames={className ? { image: className } : undefined}
        objectFit={'contain'}
        src={resolvedSrc}
        styles={{ image: { maxWidth: '100%', ...style } }}
        variant={'borderless'}
      />
    );
  },
);

MarkdownImage.displayName = 'MarkdownImage';

export default MarkdownImage;
