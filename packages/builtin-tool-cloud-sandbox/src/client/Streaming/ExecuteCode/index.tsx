'use client';

import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

interface ExecuteCodeParams {
  code?: string;
  description?: string;
  language?: 'javascript' | 'python' | 'typescript';
}

const languageDisplayNames: Record<string, string> = {
  javascript: 'JavaScript',
  python: 'Python',
  typescript: 'TypeScript',
};

export const ExecuteCodeStreaming = memo<BuiltinStreamingProps<ExecuteCodeParams>>(({ args }) => {
  const { code, language = 'python' } = args || {};

  const displayLanguage = languageDisplayNames[language] || language;

  // Don't render if no code yet
  if (!code) return null;

  return (
    <CodeBlock wrap code={code} language={displayLanguage}>
      <CodeBlockCopyButton />
    </CodeBlock>
  );
});

ExecuteCodeStreaming.displayName = 'ExecuteCodeStreaming';
