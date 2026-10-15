import { SortableList } from '@lobehub/ui';
import { Avatar } from '@lobehub/ui/base-ui';
import { memo } from 'react';

import { ProviderIcon } from '@/components/OrviloIcons';
import { type AiProviderListItem } from '@/types/aiProvider';

interface GroupItemProps extends AiProviderListItem {
  disabled?: boolean;
}

const GroupItem = memo<GroupItemProps>(({ id, name, source, logo, disabled }) => {
  return (
    <>
      <div className="flex gap-2">
        {source === 'custom' && logo ? (
          <Avatar
            alt={name || id}
            avatar={logo}
            shape={'square'}
            size={24}
            style={{ borderRadius: 6 }}
          />
        ) : (
          <ProviderIcon provider={id} size={24} style={{ borderRadius: 6 }} type={'avatar'} />
        )}
        {name}
      </div>
      {!disabled && <SortableList.DragHandle />}
    </>
  );
});

export default GroupItem;
