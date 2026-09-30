'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

import type { UpdateIdentityMemoryParams, UpdateIdentityMemoryState } from '../../../types';
import { getUpdateIdentityViewModel, IdentityMemoryCard } from '../../components';

const UpdateIdentityMemoryRender = memo<
  BuiltinRenderProps<UpdateIdentityMemoryParams, UpdateIdentityMemoryState>
>(({ args }) => {
  const { changedFields, identity, isEmpty, mergeStrategy } = getUpdateIdentityViewModel(args);

  if (isEmpty) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* An update only sends the fields it writes, so naming them is the whole story */}
      {changedFields.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[12px] text-muted-foreground">Updated</div>
          {changedFields.map((field) => (
            <Badge key={field} size="sm">
              {field}
            </Badge>
          ))}
          {mergeStrategy && (
            <div className="text-[12px] text-muted-foreground">· {mergeStrategy}</div>
          )}
        </div>
      )}
      <IdentityMemoryCard data={identity} fallbackTitle={'Updated Identity'} />
    </div>
  );
});

UpdateIdentityMemoryRender.displayName = 'UpdateIdentityMemoryRender';

export default UpdateIdentityMemoryRender;
