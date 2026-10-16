import { type AiProviderModelListItem } from 'model-bank';
import { memo } from 'react';

import { ModelIcon } from '@/components/OrviloIcons';

import SortDragHandle from '../../SortDragHandle';

interface ListItemProps extends AiProviderModelListItem {
  disabled?: boolean;
}

const ListItem = memo<ListItemProps>(({ id, displayName, disabled }) => {
  return (
    <>
      <div className="flex gap-2">
        <ModelIcon model={id} size={24} type={'avatar'} />
        {displayName || id}
      </div>
      {!disabled && <SortDragHandle />}
    </>
  );
});

export default ListItem;
