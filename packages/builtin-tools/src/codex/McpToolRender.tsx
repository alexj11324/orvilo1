'use client';

import { LINEAR_TOOL_NAMES } from '@orvilo/shared-tool-ui/inspectors';
import { GitHubRender, LinearRender } from '@orvilo/shared-tool-ui/renders';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import type { ComponentType } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import type { CodexMcpToolArgs, CodexMcpToolState } from './mcpToolUtils';
import {
  formatMcpInput,
  formatMcpOutput,
  getCodexGithubMcpApiName,
  getCodexLinearMcpApiName,
  getMcpErrorText,
  getMcpInput,
  getMcpInputRecord,
  getMcpResultText,
  getMcpServer,
  getMcpToolName,
} from './mcpToolUtils';

const styles = {
  sectionLabel: 'mbe-1 text-xs leading-5 text-muted-foreground',
};

const LINEAR_TOOL_NAME_SET = new Set<string>([...LINEAR_TOOL_NAMES, 'fetch', 'search']);
const SharedLinearRender = LinearRender as ComponentType<
  BuiltinRenderProps<Record<string, unknown>, unknown, string>
>;
const SharedGitHubRender = GitHubRender as ComponentType<
  BuiltinRenderProps<Record<string, unknown>, unknown, string>
>;

const McpToolRender = memo<BuiltinRenderProps<CodexMcpToolArgs, CodexMcpToolState, string>>(
  ({ args, content, messageId, pluginState, toolCallId }) => {
    const { t } = useTranslation('plugin');
    const server = getMcpServer(args, pluginState);
    const toolName = getMcpToolName(args, pluginState);
    const inputRecord = getMcpInputRecord(args, pluginState);
    const resultText = getMcpResultText(content, pluginState, args);
    const error = getMcpErrorText(pluginState, args);
    const linearApiName = getCodexLinearMcpApiName({
      input: inputRecord,
      server,
      toolName,
    });
    const githubApiName = getCodexGithubMcpApiName({
      server,
      toolName,
    });

    if (LINEAR_TOOL_NAME_SET.has(linearApiName)) {
      return (
        <SharedLinearRender
          apiName={linearApiName}
          args={inputRecord || {}}
          content={resultText}
          identifier={'codex'}
          messageId={messageId}
          pluginError={error}
          pluginState={pluginState}
          toolCallId={toolCallId}
        />
      );
    }

    if (githubApiName) {
      return (
        <SharedGitHubRender
          apiName={githubApiName}
          args={inputRecord || {}}
          content={resultText}
          identifier={'codex'}
          messageId={messageId}
          pluginError={error}
          pluginState={pluginState}
          toolCallId={toolCallId}
        />
      );
    }

    const input = formatMcpInput(getMcpInput(args, pluginState), toolName);
    const output = formatMcpOutput(resultText, toolName);

    if (!input && !output && !error) return null;

    return (
      <div className="flex flex-col gap-3">
        {input && (
          <div>
            <div className={styles.sectionLabel}>
              {t('builtins.codex.mcpTool.input', { defaultValue: 'Input' })}
            </div>
            <CodeBlock
              wrap
              className="max-h-55 overflow-auto px-2"
              code={input.text}
              language={input.language}
              variant="ghost"
            >
              {input.language !== 'text' ? undefined : <CodeBlockCopyButton />}
            </CodeBlock>
          </div>
        )}
        {output && (
          <div>
            <div className={styles.sectionLabel}>
              {t('builtins.codex.mcpTool.result', { defaultValue: 'Result' })}
            </div>
            <CodeBlock
              wrap
              className="max-h-90 overflow-auto px-2"
              code={output.text}
              language={output.language}
              variant="ghost"
            >
              {output.language !== 'text' ? undefined : <CodeBlockCopyButton />}
            </CodeBlock>
          </div>
        )}
        {error && (
          <div>
            <div className={cn(styles.sectionLabel, 'text-destructive-text')}>
              {t('builtins.codex.mcpTool.error', { defaultValue: 'Error' })}
            </div>
            <CodeBlock
              wrap
              className="max-h-55 overflow-auto px-2"
              code={error}
              language={'text'}
              variant="ghost"
            >
              <CodeBlockCopyButton />
            </CodeBlock>
          </div>
        )}
      </div>
    );
  },
);

McpToolRender.displayName = 'CodexMcpToolRender';

export default McpToolRender;
