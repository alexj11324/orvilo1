import { PatchDiff } from '@lobehub/ui';
import type { EditLocalFileState } from '@orvilo/builtin-tool-local-system';
import type { BuiltinRenderProps } from '@orvilo/types';
import { CircleAlert } from 'lucide-react';
import React, { memo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

const EditLocalFile = memo<BuiltinRenderProps<any, EditLocalFileState>>(
  ({ args, pluginState, pluginError }) => {
    if (!args)
      return (
        <div className="flex flex-col gap-2">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton style={{ width: '60%' }} />
        </div>
      );

    // Support both IPC format (file_path) and ComputerRuntime format (path)
    const filePath = args.file_path || args.path || '';

    return (
      <div className="flex flex-col gap-3">
        {pluginError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Edit Failed</AlertTitle>
            <AlertDescription>{pluginError.message || 'Unknown error occurred'}</AlertDescription>
          </Alert>
        ) : pluginState?.diffText ? (
          <PatchDiff
            fileName={filePath}
            patch={pluginState.diffText}
            showHeader={false}
            variant="borderless"
            viewMode="unified"
          />
        ) : null}
      </div>
    );
  },
);

EditLocalFile.displayName = 'EditLocalFile';

export default EditLocalFile;
