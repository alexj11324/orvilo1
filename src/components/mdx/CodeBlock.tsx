'use client';

import { type ComponentProps } from 'react';

import { Mermaid } from '@/components/Mermaid';
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockDownloadButton,
  CodeBlockExpandButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  CodeBlockWrapToggle,
  markdownCodeProps,
} from '@/components/ui/code-block';

export default function MDXCodeBlock(props: ComponentProps<'pre'>) {
  const { code, language } = markdownCodeProps(props);
  const single = !code.includes('\n') && code.length <= 32;
  if (language === 'mermaid') return <Mermaid variant="borderless">{code}</Mermaid>;
  return (
    <CodeBlock
      code={code}
      language={language ?? 'text'}
      maxLines={single ? undefined : 16}
      themes={{ light: 'lobe-theme', dark: 'lobe-theme' }}
      variant={single ? 'ghost' : 'default'}
    >
      <CodeBlockHeader>
        <CodeBlockLanguage />
        <div className="ml-auto flex items-center gap-1">
          <CodeBlockWrapToggle />
          <CodeBlockCopyButton />
          <CodeBlockDownloadButton />
        </div>
      </CodeBlockHeader>
      {!single && <CodeBlockExpandButton />}
    </CodeBlock>
  );
}
