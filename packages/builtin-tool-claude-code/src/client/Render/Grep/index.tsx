'use client';

import { Highlighter } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

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
    <Highlighter
      wrap
      language={'text'}
      showLanguage={false}
      style={{ maxHeight: 240, overflow: 'auto' }}
      variant={'borderless'}
    >
      {content}
    </Highlighter>
  );
});

Grep.displayName = 'ClaudeCodeGrep';

export default Grep;
