'use client';

import type { RunCommandState } from '@orvilo/tool-runtime';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import { getRunCommandDisplayCommand } from '../../utils/runCommand';
import AnsiOutput from './AnsiOutput';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    padding-inline: 8px 0;
  `,
}));

interface RunCommandArgs {
  background?: boolean;
  command: string;
  description?: string;
  timeout?: number;
}

const RunCommand = memo<BuiltinRenderProps<RunCommandArgs, RunCommandState>>(
  ({ args, content, pluginState }) => {
    const output = pluginState?.stdout || pluginState?.output || content;
    const stderr = pluginState?.stderr;
    const command = getRunCommandDisplayCommand(args?.command);

    return (
      <div className={cn('flex', 'flex-col', 'gap-2', styles.container)}>
        <div
          className="flex flex-col gap-2 p-2"
          style={{
            background: cssVar.colorBgContainer,
            border: `1px solid ${cssVar.colorBorderSecondary}`,
            borderRadius: cssVar.borderRadius,
          }}
        >
          <CodeBlock
            wrap
            code={command}
            language={'sh'}
            style={{ maxHeight: 200, overflow: 'auto', paddingInline: 8 }}
            variant="ghost"
          >
            <CodeBlockCopyButton />
          </CodeBlock>
          {output && <AnsiOutput text={output} />}
          {stderr?.trim() && <AnsiOutput text={stderr} />}
        </div>
      </div>
    );
  },
);

RunCommand.displayName = 'RunCommand';

export default RunCommand;
