'use client';

import { cn } from 'cn';
import {
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Download,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ComponentProps, CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Highlighter from '@/components/Highlighter';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useIsDark } from '@/hooks/useIsDark';
import { useResolvedDocumentTheme } from '@/styles/resolvedThemeRoles';

import { type DiagramLink, getDiagramLinks } from './links';
import { diagramDocument, renderDiagram } from './render';
import { type DiagramColors, diagramThemes } from './themes';

export { mermaidThemes } from './themes';

export interface MermaidProps extends Omit<ComponentProps<'div'>, 'children' | 'ref'> {
  actionIconSize?: 'small' | 'middle' | 'large';
  actionsRender?: (props: {
    actionIconSize: MermaidProps['actionIconSize'];
    content: string;
    getContent: () => string;
    originalNode: ReactNode;
  }) => ReactNode;
  animated?: boolean;
  bodyRender?: (props: { content: string; originalNode: ReactNode }) => ReactNode;
  children: string;
  classNames?: Partial<Record<'body' | 'content' | 'header', string>>;
  copyable?: boolean;
  defaultExpand?: boolean;
  fileName?: string;
  fullFeatured?: boolean;
  language?: string;
  shadow?: boolean;
  showLanguage?: boolean;
  styles?: Partial<Record<'body' | 'content' | 'header', CSSProperties>>;
  /** Retain arbitrary persisted palette names; unknown names use semantic role fallback. */
  theme?: string;
  variant?: 'filled' | 'outlined' | 'borderless';
}

export function Mermaid({
  actionIconSize = 'small',
  actionsRender,
  animated,
  bodyRender,
  children,
  className,
  classNames,
  copyable = true,
  defaultExpand = true,
  fileName,
  fullFeatured,
  language = 'mermaid',
  shadow,
  showLanguage = true,
  styles,
  theme: diagramTheme = 'lobe-theme',
  variant = 'filled',
  ...props
}: MermaidProps) {
  const { t } = useTranslation('common');
  const isDark = useIsDark();
  const theme = useResolvedDocumentTheme();
  const id = useId().replaceAll(/[^\w-]/g, '');
  const host = useRef<HTMLDivElement>(null);
  const source = children.trim();
  const [rendered, setRendered] = useState<{
    source: string;
    theme: string;
    svg: string;
    links: DiagramLink[];
  }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpand);
  const [showSource, setShowSource] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<
    { id: number; x: number; y: number; originX: number; originY: number } | undefined
  >(undefined);
  const currentTheme = `${diagramTheme}:${isDark}`;

  useEffect(() => {
    let active = true;
    const cancellation = new AbortController();
    setLoading(true);
    setError(undefined);
    const style = host.current && getComputedStyle(host.current);
    const role = (name: string) => style?.getPropertyValue(name).trim() || undefined;
    const palettes: Readonly<Partial<Record<string, DiagramColors>>> = diagramThemes;
    const palette = diagramTheme === 'lobe-theme' ? undefined : palettes[diagramTheme];
    void renderDiagram(
      `orvilo-mermaid-${id}`,
      source,
      {
        theme: 'base',
        fontFamily: theme.fontFamily,
        themeVariables: {
          darkMode: isDark,
          background: palette?.bg ?? role('--card'),
          primaryColor: palette?.bg ?? role('--card'),
          primaryTextColor: palette?.fg ?? role('--foreground'),
          secondaryColor: palette?.accent ?? role('--accent'),
          tertiaryColor: palette?.bg ?? role('--background'),
          primaryBorderColor: palette?.line ?? role('--border'),
          lineColor: palette?.line ?? role('--foreground-tertiary'),
          textColor: palette?.fg ?? role('--foreground'),
        },
      },
      cancellation.signal,
    )
      .then((svg) => {
        if (active)
          setRendered({
            source,
            theme: currentTheme,
            svg,
            links: getDiagramLinks(svg, window.location.href),
          });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      cancellation.abort();
    };
  }, [source, diagramTheme, theme.fontFamily, isDark, id, currentTheme]);

  const svg =
    rendered?.source === source && rendered.theme === currentTheme ? rendered.svg : undefined;
  const reset = () => setTransform({ x: 0, y: 0, scale: 1 });
  const zoom = (delta: number) =>
    setTransform((value) => ({
      ...value,
      scale: Math.min(4, Math.max(0.25, value.scale + delta)),
    }));
  const copy = async () => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName ?? 'diagram.mmd';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !svg) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    setTransform((value) => ({
      ...value,
      x: start.originX + event.clientX - start.x,
      y: start.originY + event.clientY - start.y,
    }));
  };
  const keyboardPan = (event: KeyboardEvent<HTMLDivElement>) => {
    const move: Record<string, [number, number]> = {
      ArrowDown: [0, -16],
      ArrowLeft: [16, 0],
      ArrowRight: [-16, 0],
      ArrowUp: [0, 16],
    };
    const offset = move[event.key];
    if (offset) {
      event.preventDefault();
      setTransform((value) => ({ ...value, x: value.x + offset[0], y: value.y + offset[1] }));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(0.25);
    } else if (event.key === '-') {
      event.preventDefault();
      zoom(-0.25);
    } else if (event.key === '0') {
      event.preventDefault();
      reset();
    }
  };
  const originalActions = copyable ? (
    <Button
      aria-label={copied ? t('copySuccess') : t('copy')}
      size={actionIconSize === 'small' ? 'icon-sm' : 'icon-lg'}
      variant="ghost"
      onClick={copy}
    >
      <Copy />
    </Button>
  ) : null;
  const diagram =
    showSource || error ? (
      <Highlighter copyable={false} language="text" variant="borderless">
        {source}
      </Highlighter>
    ) : svg ? (
      <div
        aria-label={fileName ?? 'Mermaid'}
        role="group"
        style={styles?.content}
        tabIndex={0}
        className={cn(
          'relative h-80 w-full touch-none overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          classNames?.content,
        )}
        onKeyDown={keyboardPan}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onLostPointerCapture={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
      >
        <iframe
          className="pointer-events-none h-full w-full border-0"
          sandbox=""
          srcDoc={diagramDocument(svg)}
          title={fileName ?? 'Mermaid'}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        />
      </div>
    ) : (
      <Highlighter copyable={false} language="text" variant="borderless">
        {source}
      </Highlighter>
    );

  return (
    <div
      data-code-type="mermaid"
      data-streaming={animated || undefined}
      ref={host}
      className={cn(
        'min-w-0 rounded-(--radius-card) text-foreground',
        variant !== 'borderless' && 'border border-border',
        variant === 'filled' && 'bg-muted',
        shadow && 'shadow-(--shadow-raised)',
        className,
      )}
      {...props}
    >
      <div
        className={cn('flex min-h-9 items-center gap-1 px-2', classNames?.header)}
        style={styles?.header}
      >
        {showLanguage && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {fileName ?? language}
          </span>
        )}
        {loading && <Spinner aria-label={t('loading')} />}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {actionsRender
            ? actionsRender({
                actionIconSize,
                content: source,
                getContent: () => source,
                originalNode: originalActions,
              })
            : originalActions}
          {fullFeatured && (
            <Button
              aria-expanded={expanded}
              aria-label={t('toggle')}
              size="icon-sm"
              variant="ghost"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <ChevronDown /> : <ChevronRight />}
            </Button>
          )}
        </div>
      </div>
      {(!fullFeatured || expanded) && (
        <div className={cn('min-w-0', classNames?.body)} style={styles?.body}>
          {error && (
            <p className="px-3 text-xs text-destructive-text" role="alert">
              {t('mermaid.diagramError')}: {error}
            </p>
          )}
          {copyError && (
            <p className="px-3 text-xs text-destructive-text" role="alert">
              {t('copyFail')}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-1 px-2">
            <Button
              aria-label={`${t('zoom')} +`}
              disabled={!svg}
              size="icon-sm"
              variant="ghost"
              onClick={() => zoom(0.25)}
            >
              <ZoomIn />
            </Button>
            <Button
              aria-label={`${t('zoom')} −`}
              disabled={!svg}
              size="icon-sm"
              variant="ghost"
              onClick={() => zoom(-0.25)}
            >
              <ZoomOut />
            </Button>
            <Button aria-label={t('reset')} size="icon-sm" variant="ghost" onClick={reset}>
              <RotateCcw />
            </Button>
            <Button
              aria-label={t('mermaid.viewSource')}
              aria-pressed={showSource}
              size="icon-sm"
              variant="ghost"
              onClick={() => setShowSource((value) => !value)}
            >
              <Code />
            </Button>
            {fullFeatured && (
              <Button aria-label={t('download')} size="icon-sm" variant="ghost" onClick={download}>
                <Download />
              </Button>
            )}
          </div>
          {bodyRender ? bodyRender({ content: source, originalNode: diagram }) : diagram}
          {svg && rendered?.links.length ? (
            <nav
              aria-label={t('mermaid.links')}
              className="flex flex-wrap gap-2 border-t border-divider px-3 py-2"
            >
              {rendered.links.map((link, index) => (
                <a
                  className="rounded-(--radius-input) text-sm text-link underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={link.href}
                  key={`${index}:${link.href}`}
                  rel={link.rel}
                  target={link.target}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default Mermaid;
