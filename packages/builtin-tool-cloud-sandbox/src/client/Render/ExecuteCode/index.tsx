'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalTitle,
} from '@/components/ai-elements/terminal';
import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

import type { ExecuteCodeState } from '../../../types';

const styles = { container: 'overflow-hidden ps-2 pe-0' };

interface ExecuteCodeParams {
  code: string;
  language?: 'javascript' | 'python' | 'typescript';
}

const ExecuteCode = memo<BuiltinRenderProps<ExecuteCodeParams, ExecuteCodeState>>(
  ({ args, pluginState }) => {
    const language = args.language || 'python';

    return (
      <div className={cn('flex flex-col gap-2', styles.container)}>
        <div className="rounded-md border bg-card flex flex-col" style={{ gap: 8, padding: 8 }}>
          <CodeBlock
            wrap
            code={args.code}
            language={language}
            style={{ maxHeight: 200, overflow: 'auto', paddingInline: 8 }}
            variant={'ghost'}
          >
            <CodeBlockCopyButton />
          </CodeBlock>
          {[
            ['stdout', pluginState?.output],
            ['stderr', pluginState?.stderr],
          ].map(([label, output]) =>
            output ? (
              <Terminal autoScroll={false} key={label} output={output}>
                <TerminalHeader>
                  <TerminalTitle>{label}</TerminalTitle>
                  <TerminalActions>
                    <TerminalCopyButton />
                  </TerminalActions>
                </TerminalHeader>
                <TerminalContent className="max-h-[200px] p-2 text-xs" />
              </Terminal>
            ) : null,
          )}
        </div>
      </div>
    );
  },
);

ExecuteCode.displayName = 'ExecuteCode';

export default ExecuteCode;
