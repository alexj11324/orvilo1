'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo, useMemo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import {
  getGithubOutput,
  type GithubRunCommandArgs,
  type GithubRunCommandState,
  normalizeGhCommand,
  tryParseJson,
} from './utils';

const styles = {
  exitCode: 'ms-2 font-mono text-xs leading-5',
  exitCodeError: 'text-destructive-text',
  exitCodeSuccess: 'text-success-text',
  sectionLabel: 'mb-1 text-xs leading-5 text-muted-foreground',
};

const GithubRunCommandRender = memo<
  BuiltinRenderProps<GithubRunCommandArgs, GithubRunCommandState>
>(({ args, content, pluginState }) => {
  const rawCommand = args?.command || '';
  const normalized = normalizeGhCommand(rawCommand);

  const output = getGithubOutput(pluginState, content);
  const stderr = pluginState?.stderr || '';
  const exitCode = pluginState?.exitCode;
  const success = pluginState?.success ?? (exitCode === undefined ? undefined : exitCode === 0);

  const { language: outputLanguage, body: outputBody } = useMemo(() => {
    const parsed = tryParseJson(output);
    if (parsed !== undefined) {
      return { body: JSON.stringify(parsed, null, 2), language: 'json' as const };
    }
    return { body: output, language: 'text' as const };
  }, [output]);

  if (!normalized && !output && !stderr) return null;

  return (
    <div className="flex flex-col gap-3">
      {normalized && (
        <div>
          <div className={styles.sectionLabel}>
            Command
            {success !== undefined && (
              <span
                className={`${styles.exitCode} ${
                  success ? styles.exitCodeSuccess : styles.exitCodeError
                }`}
              >
                exit {exitCode ?? (success ? 0 : 1)}
              </span>
            )}
          </div>
          <CodeBlock
            wrap
            className="max-h-40 overflow-auto px-2"
            code={`gh ${normalized}`}
            language={'sh'}
            variant="ghost"
          >
            <CodeBlockCopyButton />
          </CodeBlock>
        </div>
      )}
      {outputBody && (
        <div>
          <div className={styles.sectionLabel}>Output</div>
          <CodeBlock
            wrap
            className="max-h-90 overflow-auto px-2"
            code={outputBody}
            language={outputLanguage}
            variant="ghost"
          >
            {outputLanguage === 'json' ? undefined : <CodeBlockCopyButton />}
          </CodeBlock>
        </div>
      )}
      {stderr && (
        <div>
          <div className={cn(styles.sectionLabel, 'text-destructive-text')}>Stderr</div>
          <CodeBlock
            wrap
            className="max-h-50 overflow-auto px-2"
            code={stderr}
            language={'text'}
            variant="ghost"
          >
            <CodeBlockCopyButton />
          </CodeBlock>
        </div>
      )}
    </div>
  );
});

GithubRunCommandRender.displayName = 'GithubRunCommandRender';

export default GithubRunCommandRender;
