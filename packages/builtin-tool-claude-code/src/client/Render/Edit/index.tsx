'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { createTwoFilesPatch } from 'diff';
import path from 'path-browserify-esm';
import { memo, useMemo } from 'react';

import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  parseUnifiedDiff,
} from '@/components/ui/code-block';
import { Skeleton } from '@/components/ui/skeleton';

interface EditArgs {
  file_path?: string;
  new_string?: string;
  old_string?: string;
  replace_all?: boolean;
}

const Edit = memo<BuiltinRenderProps<EditArgs>>(({ args }) => {
  const file = useMemo(() => {
    if (!args) return null;
    const oldContent = args.old_string ?? '';
    const newContent = args.new_string ?? '';
    const context = Math.max(oldContent.split('\n').length, newContent.split('\n').length);
    const patch = createTwoFilesPatch(
      args.file_path || 'file',
      args.file_path || 'file',
      oldContent,
      newContent,
      '',
      '',
      { context },
    );
    return parseUnifiedDiff(patch)[0];
  }, [args]);

  if (!args)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton style={{ width: '60%' }} />
      </div>
    );

  const filePath = args.file_path || '';
  const fileName = filePath ? path.basename(filePath) : '';

  return (
    <div className="flex flex-col gap-3 px-2">
      <CodeBlock showLineNumbers lines={file?.lines ?? []} variant="ghost">
        {!!fileName && (
          <CodeBlockHeader>
            <CodeBlockTitle>{fileName || filePath}</CodeBlockTitle>
            {file && (file.removed > 0 || file.added > 0) && (
              <span className="ml-auto inline-flex gap-2 font-mono text-xs">
                {file.removed > 0 && <span className="text-destructive">-{file.removed}</span>}
                {file.added > 0 && <span className="text-success">+{file.added}</span>}
              </span>
            )}
          </CodeBlockHeader>
        )}
      </CodeBlock>
    </div>
  );
});

Edit.displayName = 'ClaudeCodeEdit';

export default Edit;
