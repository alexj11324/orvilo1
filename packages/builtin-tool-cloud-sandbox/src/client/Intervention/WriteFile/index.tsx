'use client';

import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

interface WriteLocalFileParams {
  content: string;
  createDirectories?: boolean;
  path: string;
}

const WriteFile = memo<BuiltinInterventionProps<WriteLocalFileParams>>(({ args }) => {
  const { path, content } = args;
  const preview = content.length > 500 ? content.slice(0, 500) + '\n...(truncated)' : content;

  return (
    <div className="flex flex-col gap-2">
      <div>Write to file: {path}</div>
      <CodeBlock
        wrap
        code={preview}
        language={'text'}
        style={{ maxHeight: 200, overflow: 'auto', padding: '4px 8px' }}
        variant={'default'}
      />
    </div>
  );
});

export default WriteFile;
