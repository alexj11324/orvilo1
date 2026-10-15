'use client';

import { cn } from 'cn';
import {
  type ComponentProps,
  type CSSProperties,
  memo,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useIsDark } from '@/hooks/useIsDark';

import ImageViewer, { type ViewerItem } from './ImageViewer';
import { type ImagePreviewOptions, usePreviewGroup } from './PreviewGroup';

export type { ImagePreviewOptions } from './PreviewGroup';
export { default as PreviewGroup, type PreviewGroupProps } from './PreviewGroup';

export type ImageProps = Omit<ComponentProps<'img'>, 'height' | 'width'> & {
  /** Overlay controls in the top-end corner, shown on hover unless `alwaysShowActions`. */
  actions?: ReactNode;
  alwaysShowActions?: boolean;
  classNames?: { image?: string; wrapper?: string };
  height?: number | string;
  /** Render a skeleton of the image box instead of the image. */
  isLoading?: boolean;
  maxHeight?: number | string;
  maxWidth?: number | string;
  minHeight?: number | string;
  minWidth?: number | string;
  objectFit?: 'contain' | 'cover';
  /** Click-to-open lightbox; inherits the enclosing `PreviewGroup` options. */
  preview?: boolean | ImagePreviewOptions;
  ref?: Ref<HTMLDivElement>;
  /** Width and height together, overridden by `width` / `height`. */
  size?: number | string;
  styles?: { image?: CSSProperties; wrapper?: CSSProperties };
  variant?: 'borderless' | 'filled' | 'outlined';
  width?: number | string;
};

const fallbackSvg = (background: string, stroke: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="256" fill="${background}"/><g stroke="${stroke}" stroke-width="8.11" stroke-linecap="round" stroke-linejoin="round"><path d="M156.9 91H100.1C95.6 91 92 94.6 92 99.1V155.9C92 160.4 95.6 164 100.1 164H156.9C161.4 164 165 160.4 165 155.9V99.1C165 94.6 161.4 91 156.9 91Z"/><path d="M165 139.7L152.5 127.2C151 125.6 148.9 124.8 146.7 124.8C144.6 124.8 142.5 125.6 141 127.2L104.2 164M116.3 123.4C120.8 123.4 124.4 119.8 124.4 115.3C124.4 110.9 120.8 107.2 116.3 107.2C111.9 107.2 108.2 110.9 108.2 115.3C108.2 119.8 111.9 123.4 116.3 123.4Z"/></g></svg>`,
  )}`;
const FALLBACK_LIGHT = fallbackSvg('#ECECEC', '#D7D7D7');
const FALLBACK_DARK = fallbackSvg('#3B3B3B', '#626262');

const VARIANT_CLASS = {
  borderless: 'border-none bg-transparent shadow-none',
  filled: 'border border-divider bg-muted',
  outlined: 'border border-divider bg-card',
};

const DEFAULT_PREVIEW: ImagePreviewOptions = {};

/** Merge group and image preview settings; `false` on either level disables preview. */
const resolvePreview = (
  group: boolean | ImagePreviewOptions | undefined,
  image: boolean | ImagePreviewOptions | undefined,
): ImagePreviewOptions | false => {
  if (image === false || (image === undefined && group === false)) return false;
  if (typeof group !== 'object' && typeof image !== 'object') return DEFAULT_PREVIEW;
  return {
    ...(typeof group === 'object' ? group : undefined),
    ...(typeof image === 'object' ? image : undefined),
  };
};

/**
 * Image with a loading skeleton, a broken-image fallback, hover actions and a
 * click-to-zoom lightbox. Inside a `PreviewGroup` the lightbox steps through
 * every grouped image.
 */
const Image = memo<ImageProps>(
  ({
    actions,
    alt,
    alwaysShowActions,
    className,
    classNames,
    height,
    isLoading,
    loading = 'lazy',
    maxHeight = '100%',
    maxWidth = '100%',
    minHeight,
    minWidth,
    objectFit = 'cover',
    onClick,
    onError,
    preview,
    ref,
    size,
    src,
    style,
    styles: customStyles,
    variant = 'filled',
    width,
    ...rest
  }) => {
    const isDark = useIsDark();
    const group = usePreviewGroup();
    const id = useId();
    const imgRef = useRef<HTMLImageElement>(null);
    const [failedSrc, setFailedSrc] = useState<string>();
    const [viewer, setViewer] = useState<{ index: number; items: ViewerItem[] } | null>(null);

    const resolvedWidth = width ?? size;
    const resolvedHeight = height ?? size;
    const previewOptions = useMemo(
      () => resolvePreview(group?.preview, preview),
      [group?.preview, preview],
    );

    useEffect(() => {
      if (!group || !previewOptions) return;
      return group.register({ getElement: () => imgRef.current, id, options: previewOptions });
    }, [group, id, previewOptions]);

    const openPreview = () => {
      const element = imgRef.current;
      if (!previewOptions || !element) return;
      const own = { options: previewOptions, src: element.currentSrc || element.src };
      if (!group) {
        setViewer({ index: 0, items: [own] });
        return;
      }
      const items: ViewerItem[] = [];
      let index = 0;
      for (const entry of group.getEntries()) {
        const node = entry.getElement();
        if (!node || !entry.options) continue;
        if (node === element) index = items.length;
        items.push({ options: entry.options, src: node.currentSrc || node.src });
      }
      setViewer(items.length > 0 ? { index, items } : { index: 0, items: [own] });
    };

    const handleClick = (event: MouseEvent<HTMLImageElement>) => {
      onClick?.(event);
      openPreview();
    };

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
      setFailedSrc(src);
      onError?.(event);
    };

    const boxStyle = { maxHeight, maxWidth, minHeight, minWidth };

    if (isLoading)
      return (
        <div onClick={onClick as unknown as ComponentProps<'div'>['onClick']}>
          <Skeleton style={{ ...boxStyle, height: resolvedHeight, width: resolvedWidth }} />
        </div>
      );

    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          'group/image relative flex w-fit cursor-pointer select-none flex-col overflow-hidden rounded-(--radius-card) leading-none',
          VARIANT_CLASS[variant],
          className,
        )}
      >
        {actions && (
          <div
            className={cn(
              'absolute inset-bs-0 inset-e-0 z-1 cursor-pointer',
              alwaysShowActions
                ? 'opacity-100'
                : 'opacity-0 group-hover/image:opacity-100 focus-within:opacity-100',
            )}
          >
            {actions}
          </div>
        )}
        <div
          className={cn('relative h-auto max-w-full overflow-hidden', classNames?.wrapper)}
          style={customStyles?.wrapper}
        >
          <img
            alt={alt}
            height={resolvedHeight}
            loading={loading}
            ref={imgRef}
            src={
              failedSrc !== undefined && failedSrc === src
                ? isDark
                  ? FALLBACK_DARK
                  : FALLBACK_LIGHT
                : src
            }
            width={resolvedWidth}
            className={cn(
              'flex h-auto w-auto items-center justify-center',
              previewOptions && 'cursor-zoom-in',
              classNames?.image,
            )}
            style={{
              ...boxStyle,
              height: resolvedHeight,
              objectFit,
              width: resolvedWidth,
              ...customStyles?.image,
            }}
            onClick={handleClick}
            onError={handleError}
            {...rest}
          />
        </div>
        {viewer && (
          <ImageViewer
            initialIndex={viewer.index}
            items={viewer.items}
            onClose={() => setViewer(null)}
          />
        )}
      </div>
    );
  },
);
Image.displayName = 'Image';

export default Image;
