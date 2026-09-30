import { Skeleton } from '@lobehub/ui/base-ui';
import type { ListLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinPlaceholderProps } from '@orvilo/types';
import React, { memo } from 'react';

import { LocalFolder } from '@/features/LocalFile';

export const ListFiles = memo<BuiltinPlaceholderProps<ListLocalFileParams>>(({ args }) => {
  return (
    <div className="flex flex-col gap-3">
      {args?.path && <LocalFolder path={args.path} />}
      <div className="flex flex-col items-center justify-center h-[140px]">
        <div className="flex flex-col gap-1 w-[90%]">
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
        </div>
      </div>
    </div>
  );
});
