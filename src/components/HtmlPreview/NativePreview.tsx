'use client';

import { extractHtmlTitle } from '@orvilo/html-artifact';
import { exportFile } from '@orvilo/utils/client';
import { cn } from 'cn';
import { Code2, Download, Eye, Maximize2 } from 'lucide-react';
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import CopyButton from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import {
  buildHtmlPreviewDocument,
  HTML_PREVIEW_MAX_LENGTH,
  htmlPreviewSandbox,
  htmlPreviewState,
  type HtmlPreviewStreamingMode,
} from './document';

export type HtmlPreviewMode = 'preview' | 'source';
export interface HtmlPreviewProps extends Omit<ComponentProps<'div'>, 'children' | 'onCopy'> {
  actionIconSize?: 'small' | 'middle' | 'large';
  actionsRender?: (props: {
    actionIconSize: HtmlPreviewProps['actionIconSize'];
    content: string;
    getContent: () => string;
    mode: HtmlPreviewMode;
    originalNode: ReactNode;
    setMode: (mode: HtmlPreviewMode) => void;
  }) => ReactNode;
  animated?: boolean;
  bodyRender?: (props: {
    content: string;
    mode: HtmlPreviewMode;
    originalNode: ReactNode;
  }) => ReactNode;
  children: string;
  classNames?: Partial<Record<'content' | 'header' | 'iframe', string>>;
  copyable?: boolean;
  defaultHeight?: number;
  defaultMode?: HtmlPreviewMode;
  downloadable?: boolean;
  fileName?: string;
  language?: string;
  onExpand?: (content: string) => void;
  sandbox?: string;
  shadow?: boolean;
  streaming?: boolean;
  streamingMode?: HtmlPreviewStreamingMode;
  styles?: Partial<Record<'content' | 'header' | 'iframe', CSSProperties>>;
  theme?: 'light' | 'dark';
  variant?: 'filled' | 'outlined' | 'borderless';
}

function PreviewFrame({
  content,
  live,
  defaultHeight,
  sandbox,
  title,
  className,
  style,
  theme,
}: {
  content: string;
  live: boolean;
  defaultHeight: number;
  sandbox?: string;
  title: string;
  className?: string;
  style?: CSSProperties;
  theme?: 'light' | 'dark';
}) {
  const previewId = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(defaultHeight);
  const [ready, setReady] = useState(false);
  const latest = useRef(content);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentContent = live ? '' : content;
  const srcDoc = useMemo(
    () => buildHtmlPreviewDocument(documentContent, previewId, live, theme),
    [live, documentContent, previewId, theme],
  );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (
        event.source !== frame.current?.contentWindow ||
        !data ||
        typeof data !== 'object' ||
        !('token' in data) ||
        data.token !== previewId ||
        !('type' in data)
      )
        return;
      if (data.type === 'orvilo-html-ready') setReady(true);
      if (
        data.type === 'orvilo-html-height' &&
        'height' in data &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height) &&
        data.height > 0 &&
        data.height <= 100_000
      ) {
        setHeight(Math.max(defaultHeight, data.height));
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [previewId, defaultHeight]);
  useEffect(() => {
    latest.current = content;
    if (!live || !ready || pending.current !== null) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      frame.current?.contentWindow?.postMessage(
        { type: 'orvilo-html-update', token: previewId, content: latest.current },
        '*',
      );
    }, 100);
  }, [content, live, ready, previewId]);
  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );
  return (
    <iframe
      className={cn('block w-full border-0 bg-card', className)}
      ref={frame}
      sandbox={htmlPreviewSandbox(sandbox)}
      srcDoc={srcDoc}
      style={{ height, ...style }}
      title={title}
      onLoad={() => {
        if (live) setReady(true);
      }}
    />
  );
}

export function HtmlPreview({
  children,
  animated = false,
  streaming,
  streamingMode = 'auto',
  defaultHeight = 400,
  defaultMode = 'preview',
  copyable = true,
  downloadable = true,
  fileName = 'preview.html',
  language = 'html',
  onExpand,
  sandbox,
  shadow = false,
  theme,
  variant = 'filled',
  actionIconSize = 'small',
  actionsRender,
  bodyRender,
  className,
  classNames,
  style,
  styles,
  ...props
}: HtmlPreviewProps) {
  const { t } = useTranslation('components');
  const [mode, setMode] = useState<HtmlPreviewMode>(defaultMode);
  const [expanded, setExpanded] = useState(false);
  const state = htmlPreviewState(children, streaming ?? animated, streamingMode);
  const effectiveMode = state === 'source' ? 'source' : mode;
  const title = extractHtmlTitle(children) || t('HtmlPreview.iframeTitle');
  const largeSource =
    children.length > HTML_PREVIEW_MAX_LENGTH ? (
      <textarea
        readOnly
        aria-label={title}
        className="w-full resize-y rounded-(--radius-input) border border-divider bg-card p-3 font-mono text-sm"
        style={{ height: defaultHeight }}
        value={children}
      />
    ) : null;
  const body =
    largeSource ??
    (effectiveMode === 'source' || state === 'deferred' ? (
      <CodeBlock
        code={children}
        language={language}
        streaming={streaming ?? animated}
        themes={{ light: 'lobe-theme', dark: 'lobe-theme' }}
      >
        {copyable && <CodeBlockCopyButton />}
      </CodeBlock>
    ) : (
      <PreviewFrame
        className={classNames?.iframe}
        content={children}
        defaultHeight={defaultHeight}
        key={state === 'live' ? 'live' : 'static'}
        live={state === 'live'}
        sandbox={sandbox}
        style={styles?.iframe}
        theme={theme}
        title={title}
      />
    ));
  const controlSize =
    actionIconSize === 'large' ? 'large' : actionIconSize === 'middle' ? 'normal' : 'compact';
  const copySize = {
    blockSize: actionIconSize === 'large' ? 40 : actionIconSize === 'middle' ? 36 : 32,
    size: 16,
    borderRadius: 'var(--radius-button)',
  };
  const actions = (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-1', classNames?.header)}
      style={styles?.header}
    >
      <Button
        disabled={state === 'source'}
        size={controlSize}
        variant="ghost"
        aria-label={t(
          effectiveMode === 'preview' ? 'HtmlPreview.mode.code' : 'HtmlPreview.mode.preview',
        )}
        onClick={() => setMode(mode === 'preview' ? 'source' : 'preview')}
      >
        {effectiveMode === 'preview' ? <Code2 /> : <Eye />}
      </Button>
      {copyable && (
        <CopyButton content={children} size={copySize} title={t('copy', { ns: 'common' })} />
      )}
      {downloadable && (
        <Button
          aria-label={t('HtmlPreview.actions.download')}
          size={controlSize}
          variant="ghost"
          onClick={() => exportFile(children, fileName)}
        >
          <Download />
        </Button>
      )}
      <Button
        aria-label={t('fullscreen', { ns: 'common' })}
        size={controlSize}
        variant="ghost"
        onClick={() => (onExpand ? onExpand(children) : setExpanded(true))}
      >
        <Maximize2 />
      </Button>
    </div>
  );
  return (
    <div
      {...props}
      data-theme={theme}
      style={style}
      className={cn(
        'min-w-0 overflow-hidden text-sm text-foreground',
        variant !== 'borderless' && 'rounded-(--radius-card) border border-divider',
        variant === 'filled' && 'bg-card',
        shadow && 'shadow-(--shadow-raised)',
        className,
      )}
    >
      {actionsRender
        ? actionsRender({
            actionIconSize,
            content: children,
            getContent: () => children,
            mode,
            originalNode: actions,
            setMode,
          })
        : actions}
      <div className={cn('min-h-0 min-w-0', classNames?.content)} style={styles?.content}>
        {bodyRender
          ? bodyRender({ content: children, mode: effectiveMode, originalNode: body })
          : body}
      </div>
      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent className="h-dvh max-w-none" side="bottom">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            {largeSource ??
              (state === 'source' || state === 'deferred' ? (
                <CodeBlock code={children} language={language}>
                  <CodeBlockCopyButton />
                </CodeBlock>
              ) : (
                <PreviewFrame
                  content={children}
                  defaultHeight={defaultHeight}
                  live={false}
                  sandbox={sandbox}
                  theme={theme}
                  title={title}
                />
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
export default HtmlPreview;
