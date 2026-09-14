import { Center, Flexbox } from '@lobehub/ui';
import { Skeleton } from '@lobehub/ui/base-ui';
import type { ListLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinPlaceholderProps } from '@orvilo/types';
import React, { memo } from 'react';

import { LocalFolder } from '@/features/LocalFile';

export const ListFiles = memo<BuiltinPlaceholderProps<ListLocalFileParams>>(({ args }) => {
  return (
    <Flexbox gap={12}>
      {args?.path && <LocalFolder path={args.path} />}
      <Center height={140}>
        <Flexbox gap={4} width={'90%'}>
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
        </Flexbox>
      </Center>
    </Flexbox>
  );
});
