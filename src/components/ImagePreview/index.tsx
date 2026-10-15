'use client';

import { cn } from 'cn';
import { ImageOff } from 'lucide-react';
import { createContext, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSingleton } from '@/hooks/useSingleton';

import type { GalleryEntry, ImagePreviewOptions, ImageProps, PreviewGroupProps } from './types';
import { ImageViewer } from './viewer';

interface Registration {
  getEntry: () => GalleryEntry | undefined;
  id: string;
}
interface GalleryContextValue {
  open: (id: string, opener: HTMLElement) => void;
  preview?: PreviewGroupProps['preview'];
  register: (registration: Registration) => () => void;
}
const GalleryContext = createContext<GalleryContextValue | null>(null);

export function PreviewGroup({ children, enable = true, preview }: PreviewGroupProps) {
  const entries = useSingleton(() => new Map<string, Registration>());
  const [session, setSession] = useState<{
    entries: GalleryEntry[];
    index: number;
    opener: HTMLElement;
  }>();
  const register = useCallback(
    (registration: Registration) => {
      entries.set(registration.id, registration);
      return () => {
        entries.delete(registration.id);
      };
    },
    [entries],
  );
  const open = useCallback(
    (id: string, opener: HTMLElement) => {
      const gallery = [...entries.values()]
        .flatMap((registration) => {
          const entry = registration.getEntry();
          return entry?.element.isConnected ? [entry] : [];
        })
        .sort((a, b) => {
          const relation = a.element.compareDocumentPosition(b.element);
          return relation & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : relation & Node.DOCUMENT_POSITION_PRECEDING
              ? 1
              : 0;
        });
      const index = gallery.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      gallery[index].options.onOpenChange?.(true);
      setSession({ entries: gallery, index, opener });
    },
    [entries],
  );
  // Stable registration/open functions prevent image effects from churning when the viewer changes.
  const context = useMemo(() => ({ open, preview, register }), [open, preview, register]);
  if (!enable) return children;
  return (
    <GalleryContext value={context}>
      {children}
      {session && (
        <ImageViewer
          entries={session.entries}
          initialIndex={session.index}
          opener={session.opener}
          onClose={() => {
            session.entries[session.index].options.onOpenChange?.(false);
            setSession(undefined);
          }}
        />
      )}
    </GalleryContext>
  );
}

export function Image({
  actions,
  alwaysShowActions,
  alt = '',
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
  onLoad,
  preview,
  ref,
  size,
  src,
  style,
  styles,
  variant = 'filled',
  width,
  onKeyDown,
  ...rest
}: ImageProps) {
  const { t } = useTranslation('common');
  const group = use(GalleryContext);
  const id = useId();
  const imageRef = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<{ failed: boolean; loaded: boolean; source?: string }>({
    failed: false,
    loaded: false,
    source: src,
  });
  const [retry, setRetry] = useState(0);
  const [standalone, setStandalone] = useState<GalleryEntry>();
  const disabled = preview === false || (preview === undefined && group?.preview === false);
  const options: ImagePreviewOptions = {
    ...(typeof group?.preview === 'object' ? group.preview : {}),
    ...(typeof preview === 'object' ? preview : {}),
  };
  const failed = state.source === src && state.failed;
  const loaded = state.source === src && state.loaded;
  const canPreview = !disabled && !!src && !failed && !isLoading;
  const current = useRef({ canPreview, id, options, src });
  current.current = { canPreview, id, options, src };

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0)
      setState({ failed: false, loaded: true, source: src });
  }, [src, retry, isLoading]);
  useEffect(() => {
    if (!group) return;
    return group.register({
      id,
      getEntry: () => {
        const snapshot = current.current;
        const element = imageRef.current;
        if (!snapshot.canPreview || !element) return;
        return {
          element,
          id,
          options: snapshot.options,
          source: snapshot.options.src || element.currentSrc || snapshot.src || '',
        };
      },
    });
  }, [group, id]);

  const open = () => {
    const element = imageRef.current;
    if (!canPreview || !element) return;
    if (group) group.open(id, element);
    else {
      options.onOpenChange?.(true);
      setStandalone({
        element,
        id,
        options,
        source: options.src || element.currentSrc || src || '',
      });
    }
  };
  const resolvedWidth = width ?? size;
  const resolvedHeight = height ?? size;
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        'group/image relative w-fit overflow-hidden rounded-(--radius-card)',
        variant !== 'borderless' && 'border border-divider',
        variant === 'filled' && 'bg-card',
        className,
      )}
    >
      {actions && (
        <div
          className={cn(
            'absolute top-0 right-0 z-10',
            !alwaysShowActions &&
              'opacity-0 group-hover/image:opacity-100 group-focus-within/image:opacity-100',
          )}
        >
          {actions}
        </div>
      )}
      <div
        style={styles?.wrapper}
        className={cn(
          'relative overflow-hidden rounded-[inherit]',
          (failed || isLoading) && !resolvedHeight && 'min-h-24 min-w-24',
          classNames?.wrapper,
        )}
      >
        <img
          {...rest}
          alt={alt}
          aria-haspopup={canPreview ? 'dialog' : undefined}
          height={typeof resolvedHeight === 'number' ? resolvedHeight : undefined}
          key={`${src}:${retry}`}
          loading={loading}
          ref={imageRef}
          role={canPreview ? 'button' : rest.role}
          src={src}
          tabIndex={canPreview ? 0 : rest.tabIndex}
          width={typeof resolvedWidth === 'number' ? resolvedWidth : undefined}
          className={cn(
            'block rounded-[inherit]',
            canPreview && 'cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring',
            (failed || isLoading) && 'invisible',
            classNames?.image,
          )}
          style={{
            height: resolvedHeight,
            maxHeight,
            maxWidth,
            minHeight,
            minWidth,
            objectFit,
            width: resolvedWidth,
            ...styles?.image,
          }}
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented) open();
          }}
          onError={(event) => {
            setState({ failed: true, loaded: false, source: src });
            onError?.(event);
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (
              !event.defaultPrevented &&
              canPreview &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              event.preventDefault();
              open();
            }
          }}
          onLoad={(event) => {
            setState({ failed: false, loaded: true, source: src });
            onLoad?.(event);
          }}
        />
        {(isLoading || (!loaded && !failed && !!src)) && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-fill-quaternary"
            role="status"
          >
            <Spinner aria-label={t('loading')} />
          </div>
        )}
        {failed && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-fill-quaternary p-2 text-muted-foreground"
            role="status"
          >
            <ImageOff className="size-4" />
            <span className="text-xs">{alt || t('error')}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setState({ failed: false, loaded: false, source: src });
                setRetry((value) => value + 1);
              }}
            >
              {t('retry')}
            </Button>
          </div>
        )}
      </div>
      {standalone && (
        <ImageViewer
          entries={[standalone]}
          initialIndex={0}
          opener={standalone.element}
          onClose={() => {
            standalone.options.onOpenChange?.(false);
            setStandalone(undefined);
          }}
        />
      )}
    </div>
  );
}

export { ImageSelect } from './select';
export type { ImagePreviewOptions, ImageProps, PreviewGroupProps } from './types';
