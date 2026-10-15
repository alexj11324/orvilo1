import { GripVertical } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { SortableItemHandle } from '@/components/reui/sortable';

/** Grip that starts a drag for the enclosing `SortableItem`. */
const SortDragHandle = memo(() => (
  <SortableItemHandle className="flex flex-none items-center" data-cypress="draggable-handle">
    <ActionIcon icon={GripVertical} size="small" />
  </SortableItemHandle>
));
SortDragHandle.displayName = 'SortDragHandle';

export default SortDragHandle;
