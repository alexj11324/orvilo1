'use client';

import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

interface RunCommandParams {
  command?: string;
  description?: string;
  timeout?: number;
}

export const RunCommandStreaming = memo<BuiltinStreamingProps<RunCommandParams>>(({ args }) => {
  const { command } = args || {};

  // Don't render if no command yet
  if (!command) return null;

  return (
    <CodeBlock
      streaming
      wrap
      code={command}
      language={'sh'}
      style={{ padding: '4px 8px' }}
      variant={'default'}
    >
      <CodeBlockCopyButton />
    </CodeBlock>
  );
});

RunCommandStreaming.displayName = 'RunCommandStreaming';
