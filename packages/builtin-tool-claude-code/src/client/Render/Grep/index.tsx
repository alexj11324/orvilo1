'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

interface GrepArgs {
  glob?: string;
  output_mode?: 'files_with_matches' | 'content' | 'count';
  path?: string;
  pattern?: string;
  type?: string;
}

const Grep = memo<BuiltinRenderProps<GrepArgs>>(({ content }) => {
  if (!content) return null;

  return (
    <CodeBlock
      wrap
      code={content}
      language={'text'}
      style={{ maxHeight: 240, overflow: 'auto' }}
      variant={'ghost'}
    >
      <CodeBlockCopyButton />
    </CodeBlock>
  );
});

Grep.displayName = 'ClaudeCodeGrep';

export default Grep;
