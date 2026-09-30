'use client';

import { Text } from '@lobehub/ui/base-ui';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

interface RunCommandParams {
  background?: boolean;
  command: string;
  timeout?: number;
}

const formatTimeout = (ms?: number) => {
  if (!ms) return null;
  const seconds = ms / 1000;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}min`;
  if (seconds >= 1) return `${seconds.toFixed(1)}s`;
  return `${ms}ms`;
};

const RunCommand = memo<BuiltinInterventionProps<RunCommandParams>>(({ args }) => {
  const { command, timeout, background } = args;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row justify-between">
        <Text>Execute command in cloud sandbox</Text>
        <div className="flex flex-row gap-2">
          {background && (
            <Text style={{ fontSize: 12 }} type={'secondary'}>
              background
            </Text>
          )}
          {timeout && (
            <Text style={{ fontSize: 12 }} type={'secondary'}>
              timeout: {formatTimeout(timeout)}
            </Text>
          )}
        </div>
      </div>
      {command && (
        <CodeBlock
          wrap
          code={command}
          language={'sh'}
          style={{ padding: '4px 8px' }}
          variant={'default'}
        />
      )}
    </div>
  );
});

export default RunCommand;
