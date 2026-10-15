'use client';

import { type FC, type PropsWithChildren } from 'react';

import { Mermaid } from '@/components/Markdown/Mermaid';
import {
  CodeBlock as CodeBlockRoot,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  markdownCodeProps,
} from '@/components/ui/code-block';

const SINGLE_LINE_MAX_LENGTH = 32;

const CodeBlock: FC<PropsWithChildren> = ({ children }) => {
  const { code: raw, language = 'txt' } = markdownCodeProps({ children });
  const code = raw.trim();

  if (!code) return;

  if (!code.includes('\n') && code.length <= SINGLE_LINE_MAX_LENGTH)
    return (
      <CodeBlockRoot className="my-3" code={code} language={language}>
        <CodeBlockCopyButton />
      </CodeBlockRoot>
    );
  if (language === 'mermaid') return <Mermaid variant={'borderless'}>{code}</Mermaid>;

  return (
    <CodeBlockRoot showLineNumbers className="my-3 min-w-0" code={code} language={language}>
      <CodeBlockHeader>
        <CodeBlockLanguage />
        <div className="ml-auto flex items-center gap-1">
          <CodeBlockCopyButton />
        </div>
      </CodeBlockHeader>
    </CodeBlockRoot>
  );
};

export default CodeBlock;
