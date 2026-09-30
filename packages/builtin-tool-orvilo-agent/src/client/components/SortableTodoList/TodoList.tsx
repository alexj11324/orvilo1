'use client';

import { memo, useCallback } from 'react';

import { Sortable } from '@/components/reui/sortable';

import AddItemRow from './AddItemRow';
import SortableItem from './SortableItem';
import type { TodoListItem } from './store';
import { useTodoListStore } from './store';

interface TodoListProps {
  placeholder?: string;
}

const TodoList = memo<TodoListProps>(({ placeholder }) => {
  const items = useTodoListStore((s) => s.items);
  const sortItems = useTodoListStore((s) => s.sortItems);

  const handleSortEnd = useCallback(
    (sorted: TodoListItem[]) => {
      sortItems(sorted);
    },
    [sortItems],
  );

  const getItemValue = useCallback((item: TodoListItem) => item.id, []);

  // Empty state
  if (items.length === 0) {
    return <AddItemRow placeholder={placeholder} showDragHandle={false} />;
  }

  // Use items length as key to force remount when items change structure
  // This fixes DragOverlay position issues after drag operations
  const listKey = items.map((i) => i.id).join('-');

  return (
    <>
      <Sortable
        className="flex flex-col"
        getItemValue={getItemValue}
        key={listKey}
        value={items}
        onValueChange={handleSortEnd}
      >
        {items.map((item) => (
          <SortableItem id={item.id} key={item.id} placeholder={placeholder} />
        ))}
      </Sortable>
      <AddItemRow placeholder={placeholder} />
    </>
  );
});

TodoList.displayName = 'TodoList';

export default TodoList;
