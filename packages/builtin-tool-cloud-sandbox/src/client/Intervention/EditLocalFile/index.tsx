'use client';

import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';

import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';

interface EditLocalFileParams {
  all?: boolean;
  path: string;
  replace: string;
  search: string;
}

const EditLocalFile = memo<BuiltinInterventionProps<EditLocalFileParams>>(({ args }) => {
  const { path, search, replace, all } = args;

  return (
    <div className="flex flex-col gap-2">
      <div>
        Edit file: {path} {all && '(replace all)'}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          Search:
        </div>
        <CodeBlock
          wrap
          code={search}
          language={'text'}
          style={{ padding: '4px 8px' }}
          variant={'default'}
        >
          <CodeBlockCopyButton />
        </CodeBlock>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          Replace with:
        </div>
        <CodeBlock
          wrap
          code={replace}
          language={'text'}
          style={{ padding: '4px 8px' }}
          variant={'default'}
        >
          <CodeBlockCopyButton />
        </CodeBlock>
      </div>
    </div>
  );
});

export default EditLocalFile;
