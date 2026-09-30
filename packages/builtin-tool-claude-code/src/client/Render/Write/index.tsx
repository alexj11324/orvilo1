'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import path from 'path-browserify-esm';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Skeleton } from '@/components/ui/skeleton';

interface WriteArgs {
  content?: string;
  file_path?: string;
}

const Write = memo<BuiltinRenderProps<WriteArgs>>(({ args }) => {
  if (!args)
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton className="h-4" key={i} style={{ width: i === 3 ? '60%' : '100%' }} />
        ))}
      </div>
    );

  const filePath = args.file_path || '';
  const ext = filePath ? path.extname(filePath).slice(1).toLowerCase() : '';

  const renderContent = () => {
    if (!args.content) return null;

    if (ext === 'md' || ext === 'mdx') {
      return (
        <Markdown style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
          {args.content}
        </Markdown>
      );
    }

    return (
      <CodeBlock
        wrap
        code={args.content}
        language={ext || 'text'}
        style={{ maxHeight: 240, overflow: 'auto' }}
        variant={'ghost'}
      />
    );
  };

  return renderContent();
});

Write.displayName = 'ClaudeCodeWrite';

export default Write;
