'use client';

import { memo } from 'react';

import { SortableItem as ReuiSortableItem } from '@/components/reui/sortable';

import TodoItemRow from './TodoItemRow';

interface SortableItemProps {
  id: string;
  placeholder?: string;
}

const SortableItem = memo<SortableItemProps>(({ id, placeholder }) => {
  return (
    <ReuiSortableItem style={{ padding: 0 }} value={id}>
      <TodoItemRow id={id} placeholder={placeholder} />
    </ReuiSortableItem>
  );
});

SortableItem.displayName = 'SortableItem';

export default SortableItem;
