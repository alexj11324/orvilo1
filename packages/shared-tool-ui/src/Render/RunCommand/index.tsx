'use client';

import type { RunCommandState } from '@orvilo/tool-runtime';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Snippet,
  SnippetAddon,
  SnippetCopyButton,
  SnippetInput,
} from '@/components/ai-elements/snippet';
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalTitle,
} from '@/components/ai-elements/terminal';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import { getRunCommandDisplayCommand } from '../../utils/runCommand';
import AnsiOutput from './AnsiOutput';

interface RunCommandArgs {
  background?: boolean;
  command: string;
  description?: string;
  timeout?: number;
}

const RunCommand = memo<BuiltinRenderProps<RunCommandArgs, RunCommandState>>(
  ({ args, content, pluginState }) => {
    const { t } = useTranslation('chat');
    const output = pluginState?.stdout || pluginState?.output || content;
    const stderr = pluginState?.stderr;
    const command = getRunCommandDisplayCommand(args?.command);

    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          {command.includes('\n') ? (
            <CodeBlock
              wrap
              code={command}
              language={'sh'}
              style={{ maxHeight: 200, overflow: 'auto', paddingInline: 8 }}
              variant="ghost"
            >
              <CodeBlockCopyButton />
            </CodeBlock>
          ) : (
            <Snippet className="border-border bg-muted/50 dark:bg-muted/50" code={command}>
              <SnippetInput aria-label={t('components.aiElements.terminal.command')} />
              <SnippetAddon align="inline-end">
                <SnippetCopyButton />
              </SnippetAddon>
            </Snippet>
          )}
          {[
            ['stdout', output],
            ['stderr', stderr?.trim() ? stderr : undefined],
          ].map(([label, text]) =>
            text ? (
              <Terminal autoScroll={false} key={label} output={text}>
                <TerminalHeader>
                  <TerminalTitle>{label}</TerminalTitle>
                  <TerminalActions>
                    <TerminalCopyButton />
                  </TerminalActions>
                </TerminalHeader>
                <TerminalContent className="max-h-[200px] p-2 text-xs">
                  <AnsiOutput text={text} />
                </TerminalContent>
              </Terminal>
            ) : null,
          )}
        </div>
      </div>
    );
  },
);

RunCommand.displayName = 'RunCommand';

export default RunCommand;
