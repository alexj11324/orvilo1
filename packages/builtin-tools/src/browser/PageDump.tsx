'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import type { BrowserReadPageState, BrowserSnapshotState } from './types';

type BrowserPageDumpState = BrowserReadPageState | BrowserSnapshotState;

export const PageDump = memo<BuiltinRenderProps<unknown, BrowserPageDumpState, string>>(
  ({ content, pluginState }) => {
    const pageContent =
      (pluginState && 'snapshot' in pluginState ? pluginState.snapshot : pluginState?.content) ||
      content;
    if (!pageContent) return null;
    return (
      <CodeBlock
        wrap
        code={pageContent}
        language={'text'}
        style={{ maxHeight: 360 }}
        variant="ghost"
      >
        <CodeBlockCopyButton />
      </CodeBlock>
    );
  },
);

PageDump.displayName = 'BrowserPageDump';
