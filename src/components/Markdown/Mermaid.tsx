'use client';

import { cn } from 'cn';
import { type CSSProperties, useEffect, useId, useState } from 'react';

import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
} from '@/components/ui/code-block';
import { useIsDark } from '@/hooks/useIsDark';

import { resolveMermaidTheme } from './themes';

export interface MermaidProps {
  /** Still streaming: keep the source visible and render once the fence settles. */
  animated?: boolean;
  children: string;
  className?: string;
  /** Show the source header (language + copy) above the diagram. */
  fullFeatured?: boolean;
  style?: CSSProperties;
  /** Stored theme id from `mermaidThemes`; unknown ids follow the app theme. */
  theme?: string;
  variant?: 'borderless' | 'filled' | 'outlined';
}

type RenderState = { error: string; svg?: never } | { error?: never; svg: string } | null;

const MermaidSource = ({ code, error }: { code: string; error?: string }) => (
  <CodeBlock showLineNumbers className="my-3 min-w-0" code={code} language="mermaid" maxLines={16}>
    <CodeBlockHeader>
      <CodeBlockLanguage />
      <div className="ml-auto flex items-center gap-1">
        <CodeBlockCopyButton />
      </div>
    </CodeBlockHeader>
    {error ? (
      <p className="px-3 pb-2 text-xs text-destructive-text" role="alert">
        {error}
      </p>
    ) : null}
  </CodeBlock>
);

/**
 * Mermaid diagram backed by streamdown's mermaid plugin. The renderer is
 * loaded on demand; until it resolves, while the fence is still streaming, or
 * when the diagram fails to parse, the source is shown as a code block.
 */
export const Mermaid = ({
  animated,
  children,
  className,
  fullFeatured,
  style,
  theme,
  variant = 'filled',
}: MermaidProps) => {
  const isDark = useIsDark();
  const renderId = `mermaid-${useId().replaceAll(/\W/g, '')}`;
  const [state, setState] = useState<RenderState>(null);
  const resolved = resolveMermaidTheme(theme, isDark);
  const configKey = JSON.stringify(resolved.config);

  useEffect(() => {
    if (animated || !children.trim()) return;
    let cancelled = false;

    (async () => {
      try {
        const { mermaid } = await import('@streamdown/mermaid');
        const instance = mermaid.getMermaid(JSON.parse(configKey));
        const { svg } = await instance.render(renderId, children);
        if (!cancelled) setState({ svg });
      } catch (error) {
        if (!cancelled) setState({ error: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [animated, children, configKey, renderId]);

  if (animated || !state?.svg) return <MermaidSource code={children} error={state?.error} />;

  return (
    <figure
      data-slot="mermaid"
      style={{ background: resolved.background, ...style }}
      className={cn(
        'my-3 flex min-w-0 flex-col overflow-hidden',
        variant !== 'borderless' && 'rounded-(--radius-card)',
        variant === 'filled' && 'bg-fill-quaternary',
        variant === 'outlined' && 'border border-divider',
        className,
      )}
    >
      {fullFeatured ? (
        <figcaption className="px-3 pt-2 font-mono text-xs text-muted-foreground">
          mermaid
        </figcaption>
      ) : null}
      <div
        className="flex justify-center overflow-auto p-3 [&>svg]:h-auto [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </figure>
  );
};

export default Mermaid;
