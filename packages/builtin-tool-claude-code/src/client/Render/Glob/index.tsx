'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

interface GlobArgs {
  path?: string;
  pattern?: string;
}

const Glob = memo<BuiltinRenderProps<GlobArgs>>(({ content }) => {
  if (!content) return null;

  return (
    <CodeBlock
      wrap
      code={content}
      language={'text'}
      style={{ maxHeight: 240, overflow: 'auto' }}
      variant={'ghost'}
    />
  );
});

Glob.displayName = 'ClaudeCodeGlob';

export default Glob;
