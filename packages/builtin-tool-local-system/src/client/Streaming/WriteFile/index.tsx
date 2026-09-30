'use client';

import { Markdown } from '@lobehub/ui';
import type { WriteLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinStreamingProps } from '@orvilo/types';
import path from 'path-browserify-esm';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

type WriteFileArgs = WriteLocalFileParams & {
  file_path?: string;
  filePath?: string;
};

export const WriteFileStreaming = memo<BuiltinStreamingProps<WriteFileArgs>>(({ args }) => {
  const content = args?.content;
  const filePath = args?.path || args?.filePath || args?.file_path;

  // Don't render if no content yet
  if (!content) return null;

  const ext = path
    .extname(filePath || '')
    .slice(1)
    .toLowerCase();

  // Use Markdown for .md files, Highlighter for others
  if (ext === 'md' || ext === 'mdx') {
    return (
      <Markdown animated style={{ overflow: 'auto' }} variant={'chat'}>
        {content}
      </Markdown>
    );
  }

  return (
    <CodeBlock
      animated
      wrap
      code={content}
      language={ext || 'text'}
      style={{ padding: '4px 8px' }}
      variant={'default'}
    />
  );
});

WriteFileStreaming.displayName = 'WriteFileStreaming';
