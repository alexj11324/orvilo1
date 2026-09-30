'use client';

import { CodeDiff } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import path from 'path-browserify-esm';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

interface EditArgs {
  file_path?: string;
  new_string?: string;
  old_string?: string;
  replace_all?: boolean;
}

const Edit = memo<BuiltinRenderProps<EditArgs>>(({ args }) => {
  if (!args)
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton className="h-4" key={i} style={{ width: i === 3 ? '60%' : '100%' }} />
        ))}
      </div>
    );

  const filePath = args.file_path || '';
  const fileName = filePath ? path.basename(filePath) : '';
  const ext = filePath ? path.extname(filePath).slice(1).toLowerCase() : '';

  return (
    <div className="flex flex-col gap-3 px-2">
      <CodeDiff
        fileName={fileName || filePath}
        language={ext || undefined}
        newContent={args.new_string ?? ''}
        oldContent={args.old_string ?? ''}
        showHeader={!!fileName}
        variant={'borderless'}
        viewMode={'unified'}
      />
    </div>
  );
});

Edit.displayName = 'ClaudeCodeEdit';

export default Edit;
