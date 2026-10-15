'use client';

import { cn } from 'cn';
import type { ComponentProps } from 'react';
import type { BuiltinTheme } from 'shiki';
import { bundledThemesInfo } from 'shiki/themes';

import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
} from '@/components/ui/code-block';

export const highlighterThemes = [
  { displayName: 'Lobe Theme', id: 'lobe-theme' as const },
  ...bundledThemesInfo.map(({ displayName, id }) => ({ displayName, id })),
];

export interface HighlighterProps extends Omit<ComponentProps<'div'>, 'children'> {
  actionIconSize?: 'small' | 'middle' | 'large';
  children: string;
  copyable?: boolean;
  language: string;
  showLanguage?: boolean;
  theme?: 'lobe-theme' | BuiltinTheme;
  variant?: 'filled' | 'outlined' | 'borderless';
  wrap?: boolean;
}

/** Plain source stays readable while the existing asynchronous Shiki owner highlights it. */
export function Highlighter({
  actionIconSize,
  children,
  copyable = true,
  language,
  showLanguage = true,
  theme = 'lobe-theme',
  variant = 'filled',
  wrap = false,
  className,
  ...props
}: HighlighterProps) {
  const content = children.trim();
  return (
    <CodeBlock
      className={cn(variant === 'filled' && 'bg-muted', className)}
      code={content}
      language={language}
      themes={{ light: theme, dark: theme }}
      variant={variant === 'borderless' ? 'ghost' : 'default'}
      wrap={wrap}
      {...props}
    >
      {showLanguage || copyable ? (
        <CodeBlockHeader className="justify-between">
          {showLanguage && <CodeBlockLanguage />}
          {copyable && (
            <CodeBlockCopyButton
              className="ml-auto"
              size={
                actionIconSize === 'small' ? 'sm' : actionIconSize === 'large' ? 'large' : 'normal'
              }
            />
          )}
        </CodeBlockHeader>
      ) : (
        <></>
      )}
    </CodeBlock>
  );
}

export default Highlighter;
