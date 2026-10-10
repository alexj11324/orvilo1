'use client';

import { type BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

import type { ExecScriptParams, ExecScriptState } from '../../../types';

const styles = { container: 'overflow-hidden ps-2 pe-0' };

const ExecScript = memo<BuiltinRenderProps<ExecScriptParams, ExecScriptState>>(
  ({ args, content, pluginState }) => {
    const { command } = pluginState || {};

    return (
      <div className={cn('flex flex-col gap-2', styles.container)}>
        <div className="rounded-md border bg-card flex flex-col" style={{ gap: 8, padding: 8 }}>
          <CodeBlock
            wrap
            code={args?.command || command || ''}
            language={'sh'}
            style={{ paddingInline: 8 }}
            variant={'ghost'}
          >
            <CodeBlockCopyButton />
          </CodeBlock>
          {content && (
            <CodeBlock wrap code={content} language={'text'} variant={'default'}>
              <CodeBlockCopyButton />
            </CodeBlock>
          )}
        </div>
      </div>
    );
  },
);

export default ExecScript;
