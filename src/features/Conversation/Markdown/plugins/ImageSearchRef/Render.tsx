'use client';

import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Image from '@/libs/next/Image';

import { dataSelectors, useConversationStore } from '../../../store';
import { type MarkdownElementProps } from '../type';

const styles = {
  imageCardLink:
    'text-inherit no-underline transition-opacity duration-200 ease-[ease] hover:opacity-75',
  imageDomain: 'truncate text-xs leading-5 text-foreground-quaternary',
  imageThumb: 'block w-full h-40 rounded-(--radius-card) object-cover',
  imageTitle: 'line-clamp-2 text-sm leading-5.5 text-muted-foreground text-ellipsis',
  refChip:
    'cursor-pointer inline-flex gap-1 items-center py-0.25 px-1.5 rounded-(--radius-chip) text-xs leading-5 text-muted-foreground no-underline bg-fill-quaternary transition-[background-color] duration-150 ease-[ease] hover:bg-accent',
  thumbWrap: 'overflow-hidden inline-flex shrink-0 size-4 rounded-(--radius-chip)',
};

interface ImageSearchRefProperties {
  imageIndex: number;
  originalText: string;
}

const stripHtml = (html: string) => html.replaceAll(/<[^>]*>/g, '');

const Render = memo<MarkdownElementProps<ImageSearchRefProperties>>(({ node, id }) => {
  const { imageIndex, originalText } = node?.properties || {};

  const imageResults = useConversationStore(
    (s) => dataSelectors.getDbMessageById(id)(s)?.search?.imageResults,
    isEqual,
  );

  // Fallback: no image results on this message (e.g. non-image-search model)
  const image = imageResults?.[imageIndex];
  if (!image) return <span>{originalText}</span>;

  const popoverContent = (
    <div className="flex max-w-60 flex-col gap-1">
      {image.imageUri && (
        <a
          className={styles.imageCardLink}
          href={image.imageUri}
          rel="noopener noreferrer"
          target="_blank"
        >
          <img
            alt={image.title ? stripHtml(image.title) : ''}
            className={styles.imageThumb}
            src={image.imageUri}
          />
        </a>
      )}
      <a
        className={styles.imageCardLink}
        href={image.sourceUri || image.imageUri}
        rel="noopener noreferrer"
        target="_blank"
        title={image.title ? stripHtml(image.title) : undefined}
      >
        <div className="flex flex-col gap-0.5">
          {image.title && <div className={styles.imageTitle}>{stripHtml(image.title)}</div>}
          {image.domain && (
            <div className="flex items-center gap-1">
              <Image
                unoptimized
                alt={image.domain}
                className="shrink-0 rounded-(--radius-chip)"
                height={12}
                src={`https://icons.duckduckgo.com/ip3/${image.domain}.ico`}
                width={12}
              />
              <div className={styles.imageDomain}>{image.domain}</div>
            </div>
          )}
        </div>
      </a>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <a
            href={image.imageUri}
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex' }}
            target="_blank"
          />
        }
      >
        <span className={styles.refChip}>
          {image.imageUri && (
            <span className={styles.thumbWrap}>
              <img alt="" className="size-full object-cover" src={image.imageUri} />
            </span>
          )}
          {originalText}
        </span>
      </PopoverTrigger>
      <PopoverContent>{popoverContent}</PopoverContent>
    </Popover>
  );
});

Render.displayName = 'ImageSearchRefRender';

export default Render;
