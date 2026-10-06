import type { RunCommandParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

const formatTimeout = (ms?: number) => {
  if (!ms) return null;

  const seconds = ms / 1000;

  // >= 60s show minutes
  if (seconds >= 60) {
    const minutes = seconds / 60;
    return `${minutes.toFixed(1)}min`;
  }

  // >= 1s show seconds
  if (seconds >= 1) {
    return `${seconds.toFixed(1)}s`;
  }

  // < 1s show milliseconds
  return `${ms}ms`;
};

const RunCommand = memo<BuiltinInterventionProps<RunCommandParams>>(({ args }) => {
  const { description, command, timeout } = args;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row justify-between">
        {description && <div>{description}</div>}
        {timeout && (
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            timeout: {formatTimeout(timeout)}
          </div>
        )}
      </div>
      {command && (
        <CodeBlock
          wrap
          code={command}
          language={'sh'}
          style={{ padding: '4px 8px' }}
          variant={'default'}
        >
          <CodeBlockCopyButton />
        </CodeBlock>
      )}
    </div>
  );
});

export default RunCommand;
