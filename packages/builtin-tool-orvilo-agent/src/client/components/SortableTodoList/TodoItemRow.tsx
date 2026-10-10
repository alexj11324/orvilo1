'use client';

import { cn } from 'cn';
import { CircleArrowRight, GripVertical, Trash2 } from 'lucide-react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { SortableItemHandle } from '@/components/reui/sortable';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

import { useTodoListStore } from './store';

const styles = {
  deleteIcon: 'shrink-0 opacity-0 transition-opacity duration-200 ease-[ease]',
  dragHandle: 'w-4 shrink-0 opacity-0 transition-opacity duration-200 ease-[ease]',
  itemRow:
    'w-full border-b border-dashed border-sidebar-border py-2.5 ps-1 pe-3 hover:[&_.drag-handle]:opacity-100 hover:[&_.delete-icon]:opacity-100',
  textCompleted: 'text-(--ant-color-text-quaternary) line-through',
  textProcessing: 'text-(--ant-color-warning-text)',
};

interface TodoItemRowProps {
  id: string;
  placeholder?: string;
}

const TodoItemRow = memo<TodoItemRowProps>(({ id, placeholder }) => {
  const { t } = useTranslation('tool');
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultPlaceholder = placeholder || t('orvilo-agent.todoItem.placeholder');

  // Find item by stable id
  const item = useTodoListStore((s) => s.items.find((item) => item.id === id));
  const text = item?.text ?? '';
  const status = item?.status ?? 'todo';
  const isCompleted = status === 'completed';
  const isProcessing = status === 'processing';

  const focusedId = useTodoListStore((s) => s.focusedId);
  const cursorPosition = useTodoListStore((s) => s.cursorPosition);
  const updateItem = useTodoListStore((s) => s.updateItem);
  const deleteItem = useTodoListStore((s) => s.deleteItem);
  const toggleItem = useTodoListStore((s) => s.toggleItem);
  const focusPrevItem = useTodoListStore((s) => s.focusPrevItem);
  const focusNextItem = useTodoListStore((s) => s.focusNextItem);
  const setFocusedId = useTodoListStore((s) => s.setFocusedId);

  // Focus input when focusedId changes to this item and restore cursor position
  const prevFocusedIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Only restore cursor when focus changes TO this item (not on every cursorPosition change)
    if (focusedId === id && prevFocusedIdRef.current !== id) {
      const input = inputRef.current;
      if (input) {
        input.focus();
        // Clamp cursor position to text length
        const pos = Math.min(cursorPosition, text.length);
        input.setSelectionRange(pos, pos);
      }
    }
    prevFocusedIdRef.current = focusedId;
  }, [focusedId, id, cursorPosition, text.length]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateItem(id, e.target.value);
    },
    [id, updateItem],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const cursorPos = input.selectionStart ?? 0;

      if (e.key === 'Backspace' && text === '') {
        e.preventDefault();
        focusPrevItem(id, cursorPos);
        deleteItem(id);
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        focusPrevItem(id, cursorPos);
      } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        focusNextItem(id, cursorPos);
      }
    },
    [id, text, deleteItem, focusPrevItem, focusNextItem],
  );

  const handleFocus = useCallback(() => {
    setFocusedId(id);
  }, [id, setFocusedId]);

  const handleDelete = useCallback(() => {
    focusPrevItem(id, 0);
    deleteItem(id);
  }, [id, deleteItem, focusPrevItem]);

  const handleToggle = useCallback(() => {
    toggleItem(id);
  }, [id, toggleItem]);

  return (
    <div className={cn('flex', 'items-center', 'gap-1', styles.itemRow)} style={{ width: '100%' }}>
      <SortableItemHandle className={cn(styles.dragHandle, 'drag-handle')}>
        <GripVertical size={14} />
      </SortableItemHandle>
      {isProcessing ? (
        <CircleArrowRight
          size={16}
          style={{ color: 'var(--info)', cursor: 'pointer', flexShrink: 0 }}
          onClick={handleToggle}
        />
      ) : (
        <Checkbox
          checked={isCompleted}
          className="rounded-full"
          style={{ borderWidth: 1.5, borderColor: 'var(--success)' }}
          onCheckedChange={handleToggle}
        />
      )}
      <Input
        className={cn(isCompleted && styles.textCompleted, isProcessing && styles.textProcessing)}
        placeholder={defaultPlaceholder}
        ref={inputRef}
        style={{ flex: 1 }}
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
      <ActionIcon
        className={cn(styles.deleteIcon, 'delete-icon')}
        icon={Trash2}
        size="small"
        tabIndex={-1}
        onClick={handleDelete}
      />
    </div>
  );
});

TodoItemRow.displayName = 'TodoItemRow';

export default TodoItemRow;
