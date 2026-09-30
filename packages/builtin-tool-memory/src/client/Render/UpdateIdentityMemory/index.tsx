'use client';

import { Tag, Text } from '@lobehub/ui/base-ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

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
          <Text fontSize={12} type={'secondary'}>
            Updated
          </Text>
          {changedFields.map((field) => (
            <Tag key={field} size={'small'}>
              {field}
            </Tag>
          ))}
          {mergeStrategy && (
            <Text fontSize={12} type={'secondary'}>
              · {mergeStrategy}
            </Text>
          )}
        </div>
      )}
      <IdentityMemoryCard data={identity} fallbackTitle={'Updated Identity'} />
    </div>
  );
});

UpdateIdentityMemoryRender.displayName = 'UpdateIdentityMemoryRender';

export default UpdateIdentityMemoryRender;
