import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { ProviderIcon } from '@/components/OrviloIcons';
import { type AiProviderListItem } from '@/types/aiProvider';

import SortDragHandle from '../../features/SortDragHandle';

interface GroupItemProps extends AiProviderListItem {
  disabled?: boolean;
}

const GroupItem = memo<GroupItemProps>(({ id, name, source, logo, disabled }) => {
  return (
    <>
      <Flexbox horizontal gap={8}>
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
      </Flexbox>
      {!disabled && <SortDragHandle />}
    </>
  );
});

export default GroupItem;
