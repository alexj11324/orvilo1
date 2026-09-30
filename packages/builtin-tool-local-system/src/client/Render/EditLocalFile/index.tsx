import type { EditLocalFileState } from '@orvilo/builtin-tool-local-system';
import type { BuiltinRenderProps } from '@orvilo/types';
import { CircleAlert } from 'lucide-react';
import { memo, useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CodeBlock, parseUnifiedDiff } from '@/components/ui/code-block';
import { Skeleton } from '@/components/ui/skeleton';

const EditLocalFile = memo<BuiltinRenderProps<any, EditLocalFileState>>(
  ({ args, pluginState, pluginError }) => {
    const diffFiles = useMemo(
      () => parseUnifiedDiff(pluginState?.diffText ?? ''),
      [pluginState?.diffText],
    );

    if (!args)
      return (
        <div className="flex flex-col gap-2">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton style={{ width: '60%' }} />
        </div>
      );

    return (
      <div className="flex flex-col gap-3">
        {pluginError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Edit Failed</AlertTitle>
            <AlertDescription>{pluginError.message || 'Unknown error occurred'}</AlertDescription>
          </Alert>
        ) : pluginState?.diffText ? (
          diffFiles.length > 0 ? (
            diffFiles.map((file) => (
              <CodeBlock showLineNumbers key={file.file} lines={file.lines} variant="ghost" />
            ))
          ) : (
            <CodeBlock code={pluginState.diffText} language="diff" variant="ghost" />
          )
        ) : null}
      </div>
    );
  },
);

EditLocalFile.displayName = 'EditLocalFile';

export default EditLocalFile;
